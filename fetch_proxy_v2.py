#!/usr/bin/env python3
"""Personal subscription fetch and relay service.

v2 adds an upstream cache plus a UA fallback chain, so that a subscription
link which starts returning an empty shell (or disappears behind a UA policy
change) keeps serving usable content for the clients that already hold a
/sub/<id> link.

Pipeline for every upstream attempt:
  1. fetch with the caller-selected UA
  2. if that looks empty/unusable, retry the other client UAs in order
  3. if no UA gave the payload shape the client expects but some node data was
     recovered, rebuild that shape locally from the nodes we did get
  4. fall back to the last known good cached payload when TTL has expired

The browser still never sees the server-side token; Nginx injects it.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import ipaddress
import socket
import ssl
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import converter as CV
    CV_OK = True
except Exception as _exc:  # pragma: no cover - only when the module is missing
    CV_OK = False
    CV_ERR = str(_exc)

DEFAULT_UA = 'clash-verge/v1.3.6'
USER_AGENTS = {
    # --- mainstream (Clash ecosystem) ---
    'clash-verge/v1.3.6',
    'clash-for-windows/1.0.0',
    'ClashMeta/1.18.0',
    'Clash.Meta/1.18.0',
    'ClashForAndroid/3.0',
    'ClashX/1.0',
    # --- Hiddify family ---
    'hiddify/1.1.0',
    'hiddifyr/1.1.0',
    'hiddifyN/1.1.0',
    # --- Android V2Ray ---
    'v2rayNG/1.8.0',
    'v2rayN/6.0',
    'NekoBox/Android/1.2.9',
    'neko-box/1.2.9',
    'SagerNet/1.0.0',
    'Matsuri/1.0',
    'FoxRay/1.0',
    'V2Box/1.0',
    'AnXray/1.0',
    # --- iOS ---
    'shadowrocket/1.0.0',
    'Streisand/1.0',
    'Loon/3.0',
    'Quantumult X/1.0',
    'Potatso/2.0',
    'Stash/2.0',
    'Pharos/1.0',
    'FairVPN/1.0',
    # --- macOS ---
    'V2RayU/1.0',
    # --- Clash GUI variants ---
    'Surfboard/1.0',
    'Choc/1.0',
    'FLClash/1.0',
    'ClashNyanpasu/1.0',
    'clash-nyanpasu/1.0',
    'Surge/5.0',
    'Mihomo/1.18.0',
    'mihomo/1.18.0',
    # --- other ---
    'sing-box/1.8.0',
    'karing/1.0',
    'Qv2ray/2.7.0',
    'v2rayA/1.0',
    'Kitsunebi/1.0',
    'Igniter/1.0',
    'NapsternetV/1.0',
    'HTTPCustom/1.0',
    'Netch/1.0',
}
# Order matters: richest Clash output first, URI lists last.
UA_CHAIN = [
    'hiddify/1.1.0',
    'hiddifyr/1.1.0',
    'hiddifyN/1.1.0',
    'clash-for-windows/1.0.0',
    'clash-verge/v1.3.6',
    'ClashMeta/1.18.0',
    'Clash.Meta/1.18.0',
    'Mihomo/1.18.0',
    'mihomo/1.18.0',
    'ClashForAndroid/3.0',
    'ClashX/1.0',
    'Surfboard/1.0',
    'Stash/2.0',
    'Choc/1.0',
    'FLClash/1.0',
    'ClashNyanpasu/1.0',
    'clash-nyanpasu/1.0',
    'Surge/5.0',
    'sing-box/1.8.0',
    'karing/1.0',
    'NekoBox/Android/1.2.9',
    'neko-box/1.2.9',
    'v2rayNG/1.8.0',
    'v2rayN/6.0',
    'SagerNet/1.0.0',
    'Matsuri/1.0',
    'FoxRay/1.0',
    'V2Box/1.0',
    'AnXray/1.0',
    'V2RayU/1.0',
    'Qv2ray/2.7.0',
    'v2rayA/1.0',
    'Kitsunebi/1.0',
    'Igniter/1.0',
    'shadowrocket/1.0.0',
    'Streisand/1.0',
    'Loon/3.0',
    'Quantumult X/1.0',
    'Potatso/2.0',
    'Pharos/1.0',
    'FairVPN/1.0',
    'NapsternetV/1.0',
    'HTTPCustom/1.0',
    'Netch/1.0',
]
MAX_BYTES = 8 * 1024 * 1024
CACHE_TTL = 900          # reuse upstream bytes younger than this
NEG_TTL = 30             # do not hammer an upstream that just failed
STALE_GRACE = 86400      # keep serving the last good copy for a day
CACHE_MAX = 64
CACHE_DIR = '/var/lib/subconv-fetch/cache'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, 'redirects disabled for safety', headers, fp)


# --------------------------------------------------------------------------
# payload classification
# --------------------------------------------------------------------------
PROXY_INLINE = re.compile(
    r'-\s*\{\s*name\s*:|^\s*-\s+name\s*:|^\s*-\s+server\s*:|"type"\s*:\s*"(?:vless|vmess|trojan|shadowsocks|hysteria|tuic)"',
    re.M)


def payload_score(text):
    """Rough proxy count; 0 means the upstream returned an empty shell."""
    if not text:
        return 0
    if re.search(r'proxies\s*:\s*\[\s*\]', text):
        return 0
    n = len(PROXY_INLINE.findall(text))
    if n:
        return n
    low = text.lower()
    if low.lstrip().startswith('{"proxies"') or '"outbounds"' in low:
        m = re.search(r'"proxies"\s*:\s*\[\s*\]', low)
        return 0 if m else low.count('"server"')
    return 0


def uri_count(text):
    return len(re.findall(r'^\s*(?:ss|ssr|vmess|vless|trojan|hysteria2?|tuic|anytls)://', text or '', re.M))


def is_base64_blob(text):
    body = re.sub(r'\s+', '', (text or '').strip())
    if len(body) < 24 or len(body) % 4:
        return False
    if not re.fullmatch(r'[A-Za-z0-9+/=]+', body):
        return False
    try:
        import base64 as _b64
        raw = _b64.b64decode(body + '=' * (-len(body) % 4))
    except Exception:
        return False
    return uri_count(raw.decode('utf8', 'replace')) >= 1


def looks_like_clash(text):
    return bool(text and re.search(r'^\s*(mixed-port|port|proxies|proxy-groups|dns):', text, re.M))


def looks_like_singbox(text):
    t = (text or '').lstrip()
    return t.startswith('{') and '"outbounds"' in t


# --------------------------------------------------------------------------
# rebuild a usable Clash config from a node list
# --------------------------------------------------------------------------
def rebuild_payload(text, want):
    """Parse whatever node representation we got and emit the client's format.

    Returns (bytes, node_count, content_type) or None when nothing usable.
    """
    if not CV_OK:
        return None
    try:
        sub = CV.SubConv()
        if not sub.load_from_content(text, quiet=True) or not sub.nodes:
            return None
        nodes = sub.nodes
        if want == 'uri':
            body = CV.V2RayConverter.convert(nodes).encode('utf-8')
            return base64.b64encode(body), len(nodes), 'text/plain; charset=utf-8'
        if want == 'singbox':
            cfg = CV.clean_nulls(CV.SingBoxConverter.convert(nodes))
            body = json.dumps(cfg, ensure_ascii=False, indent=2).encode('utf-8')
            return body, len(nodes), 'application/json; charset=utf-8'
        cfg = CV.clean_nulls(CV.ClashConverter.convert(nodes))
        body = dump_yaml(cfg).encode('utf-8')
        return body, len(nodes), 'text/yaml; charset=utf-8'
    except Exception:
        return None


# --------------------------------------------------------------------------
# converted relay payloads
# --------------------------------------------------------------------------
CONVERT_TARGETS = {'clash', 'singbox', 'uri'}
CONVERT_OPTIONS = {'region', 'test', 'rule', 'lan'}

def convert_payload(body, target, options=None, tag_mode='off'):
    """Parse an upstream payload and emit a continuously updated target format."""
    if not CV_OK or target not in CONVERT_TARGETS:
        return None
    try:
        text = body.decode('utf-8', errors='replace') if isinstance(body, (bytes, bytearray)) else str(body)
        sub = CV.SubConv()
        if not sub.load_from_content(text, quiet=True) or not sub.nodes:
            return None
        if tag_mode and tag_mode != 'off':
            apply_node_tags(sub.nodes, tag_mode)
        opts = options if isinstance(options, dict) else {}
        if target == 'uri':
            raw = CV.V2RayConverter.convert(sub.nodes).encode('utf-8')
            return base64.b64encode(raw), 'text/plain; charset=utf-8', len(sub.nodes)
        if target == 'singbox':
            cfg = CV.clean_nulls(CV.SingBoxConverter.convert(sub.nodes))
            return json.dumps(cfg, ensure_ascii=False, indent=2).encode('utf-8'), 'application/json; charset=utf-8', len(sub.nodes)
        template = {
            'allow-lan': bool(opts.get('lan')),
            'mode': 'rule' if opts.get('rule') else 'global',
        }
        cfg = CV.clean_nulls(CV.ClashConverter.convert(sub.nodes, template))
        return dump_yaml(cfg).encode('utf-8'), 'text/yaml; charset=utf-8', len(sub.nodes)
    except Exception:
        return None

# --------------------------------------------------------------------------
# optional node-name tagging for relay links
# --------------------------------------------------------------------------
TAG_MODES = {'off', 'host', 'ip', 'port'}
OWN_TAG_RE = re.compile(r'【[^】]*(?:复用\d+|独占)[^】]*】$')

_dns_cache = {}

def clean_tag_name(name):
    return OWN_TAG_RE.sub('', str(name or '')).strip()

def resolve_host(host):
    host = str(host or '').strip().strip('[]')
    if not host:
        return ''
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        pass
    hit = _dns_cache.get(host)
    if hit and time.time() - hit[1] < 21600:
        return hit[0]
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        for info in infos:
            ip = info[4][0]
            try:
                if ipaddress.ip_address(ip).is_global:
                    _dns_cache[host] = (ip, time.time())
                    return ip
            except ValueError:
                continue
        if infos:
            ip = infos[0][4][0]
            _dns_cache[host] = (ip, time.time())
            return ip
    except socket.gaierror:
        return ''
    return ''

def tag_endpoint(node, mode):
    host = str(getattr(node, 'server', '') or '')
    port = str(getattr(node, 'port', '') or '')
    if mode == 'ip':
        host = resolve_host(host) or host
    if mode == 'port':
        return port
    return (host + ((':' + port) if port else '')).strip(':')

def tag_count_key(node, mode):
    # Same protocol + same endpoint = likely reused entrance. Cross-protocol same
    # port is not automatically a duplicate because providers may multiplex.
    proto = getattr(getattr(node, 'protocol', None), 'value', None) or str(getattr(node, 'protocol', '') or '?')
    endpoint = tag_endpoint(node, 'ip' if mode == 'ip' else 'host')
    return proto + '|' + endpoint

def apply_node_tags(nodes, mode):
    mode = mode if mode in TAG_MODES else 'off'
    if mode == 'off' or not nodes:
        return nodes
    counts = {}
    for node in nodes:
        key = tag_count_key(node, mode)
        counts[key] = counts.get(key, 0) + 1
    for node in nodes:
        base = clean_tag_name(getattr(node, 'name', ''))
        endpoint = tag_endpoint(node, mode)
        cnt = counts.get(tag_count_key(node, mode), 1)
        reuse = ('复用%s' % cnt) if cnt > 1 else '独占'
        suffix = ('【%s %s】' % (endpoint, reuse)) if endpoint else ('【%s】' % reuse)
        node.name = base + suffix
    return nodes


def patch_clash_text(text, name_map):
    """Patch only names and numeric Reality short-id, preserving source YAML."""
    lines = text.splitlines(True)
    out = []
    in_groups = False
    for line in lines:
        raw = line.rstrip('\r\n')
        nl = line[len(raw):]
        m = re.match(r'^(\s*(?:-\s+)?name:\s*)(.*?)(\s*)$', raw)
        if m:
            val = m.group(2).strip()
            quote = val[:1] if len(val) >= 2 and val[0] in "\"'" and val[-1] == val[0] else ''
            key = val[1:-1] if quote else val
            if key in name_map:
                raw = m.group(1) + json.dumps(str(name_map[key]), ensure_ascii=False) + m.group(3)
        sm = re.match(r'^(\s*short[-_]id:\s*)(.*?)(\s*)$', raw)
        if sm:
            val = sm.group(2).strip()
            if len(val) >= 2 and val[:1] in "\"'" and val[-1:] == val[:1]:
                val = val[1:-1]
            # Reality short IDs are hexadecimal strings. Quote every valid
            # value, not only all-numeric ones, to defeat YAML 1.1 coercion.
            if re.fullmatch(r'[0-9a-fA-F]{2,16}', val) and len(val) % 2 == 0:
                raw = sm.group(1) + json.dumps(val) + sm.group(3)
        if re.match(r'^\s*proxy-groups\s*:', raw):
            in_groups = True
        elif in_groups and re.match(r'^\S', raw) and not re.match(r'^\s', raw):
            in_groups = False
        if in_groups:
            # A proxy-group's member list may be written either as block
            # entries (``- name``) or as a flow sequence on one line
            # (``proxies: [A, B]``). The old line patcher only handled the
            # block form, so flow-style memberships kept the *old* node names
            # after renaming every proxy -> dangling references -> mihomo
            # drops the group and the client falls back to the GLOBAL tab
            # (all traffic proxied). Rewrite the flow sequence too.
            am = re.match(r'^(\s*proxies:\s*)(\[.*\])(\s*)$', raw)
            if am:
                inner = am.group(2)[1:-1]
                parts = re.split(r',(?=(?:[^"\']*["\'][^"\']*["\'])*[^"\']*$)', inner) if inner.strip() else []
                new_parts = []
                for part in parts:
                    val = part.strip()
                    quote = val[:1] if len(val) >= 2 and val[0] in "\"'" and val[-1] == val[0] else ''
                    key = val[1:-1] if quote else val
                    if key in name_map:
                        new_parts.append(json.dumps(str(name_map[key]), ensure_ascii=False))
                    else:
                        new_parts.append(val)
                raw = am.group(1) + '[' + ', '.join(new_parts) + ']' + am.group(3)
            else:
                lm = re.match(r'^(\s*-\s+)(.*?)(\s*)$', raw)
                if lm:
                    val = lm.group(2).strip()
                    quote = val[:1] if len(val) >= 2 and val[0] in "\"'" and val[-1] == val[0] else ''
                    key = val[1:-1] if quote else val
                    if key in name_map:
                        raw = lm.group(1) + json.dumps(str(name_map[key]), ensure_ascii=False) + lm.group(3)
        out.append(raw + nl)
    return ''.join(out)

def tagged_payload(body, fmt, mode):
    """Return (body_bytes, ctype, node_count) with node names tagged."""
    mode = mode if mode in TAG_MODES else 'off'
    if mode == 'off':
        return body, None, None
    if not CV_OK:
        return body, None, None
    try:
        text = body.decode('utf-8', errors='replace') if isinstance(body, (bytes, bytearray)) else str(body)
        sub = CV.SubConv()
        if not sub.load_from_content(text, quiet=True) or not sub.nodes:
            return body, None, None
        apply_node_tags(sub.nodes, mode)
        want = fmt if fmt in ('uri', 'singbox', 'clash') else expected_format(DEFAULT_UA)
        if want == 'uri':
            raw = CV.V2RayConverter.convert(sub.nodes).encode('utf-8')
            return base64.b64encode(raw), 'text/plain; charset=utf-8', len(sub.nodes)
        if want == 'singbox':
            cfg = CV.clean_nulls(CV.SingBoxConverter.convert(sub.nodes))
            return json.dumps(cfg, ensure_ascii=False, indent=2).encode('utf-8'), 'application/json; charset=utf-8', len(sub.nodes)
        # For Clash YAML, preserve the original template when possible by updating
        # proxy names and proxy-group references instead of rebuilding everything.
        data = None
        try:
            data = CV.yaml.safe_load(text)
        except Exception:
            data = None
        if isinstance(data, dict) and isinstance(data.get('proxies'), list):
            name_map = {}
            by_sig = {}
            for node in sub.nodes:
                sig = (getattr(getattr(node, 'protocol', None), 'value', None), node.server, int(node.port or 0), node.uuid or '', node.password or '')
                by_sig.setdefault(sig, []).append(node.name)
            for p in data.get('proxies', []):
                if not isinstance(p, dict):
                    continue
                sig = (p.get('type'), p.get('server'), int(p.get('port') or 0), p.get('uuid') or '', p.get('password') or '')
                vals = by_sig.get(sig) or []
                old = p.get('name')
                if vals and old:
                    new = vals.pop(0)
                    p['name'] = new
                    name_map[old] = new
            for proxy in data.get('proxies', []) or []:
                if not isinstance(proxy, dict):
                    continue
                reality = proxy.get('reality-opts')
                if isinstance(reality, dict) and reality.get('short-id') is not None:
                    # YAML 1.1 parses an all-numeric short-id as int; Clash
                    # requires Reality short IDs to remain hexadecimal strings.
                    reality['short-id'] = str(reality['short-id'])
            for group in data.get('proxy-groups', []) or []:
                if isinstance(group, dict) and isinstance(group.get('proxies'), list):
                    group['proxies'] = [name_map.get(x, x) for x in group['proxies']]
            # Flow-style YAML (`- { name: ..., reality-opts: {...} }`) has
            # names and short-id on the same line, so the line patcher cannot
            # safely replace individual scalars. Dump the parsed structure in
            # that case; scalar() quotes numeric strings such as short-id.
            flow_style = any(re.match(r'^\s*-\s*\{', line) for line in text.splitlines())
            if flow_style:
                return dump_yaml(CV.clean_nulls(data)).encode('utf-8'), 'text/yaml; charset=utf-8', len(sub.nodes)
            patched = patch_clash_text(text, name_map)
            return patched.encode('utf-8'), 'text/yaml; charset=utf-8', len(sub.nodes)
        cfg = CV.clean_nulls(CV.ClashConverter.convert(sub.nodes))
        return dump_yaml(cfg).encode('utf-8'), 'text/yaml; charset=utf-8', len(sub.nodes)
    except Exception as exc:
        print('name tag failed: %s' % exc)
        return body, None, None

def dump_yaml(obj, indent=0):
    """Small YAML emitter; keeps the service free of a PyYAML hard dependency."""
    pad = '  ' * indent
    if isinstance(obj, dict):
        if not obj:
            return pad + '{}\n'
        out = []
        for k, v in obj.items():
            key = str(k)
            if isinstance(v, (dict, list)) and v:
                out.append(f"{pad}{key}:\n" + dump_yaml(v, indent + 1))
            else:
                out.append(f"{pad}{key}: {scalar(v, key in ('short-id', 'short_id'))}\n")
        return ''.join(out)
    if isinstance(obj, list):
        if not obj:
            return pad + '[]\n'
        out = []
        for item in obj:
            if isinstance(item, dict) and item:
                lines = dump_yaml(item, indent + 1)
                first, _, rest = lines.partition('\n')
                out.append(pad + '- ' + first.lstrip() + '\n')
                if rest.strip():
                    out.append(rest)
            elif isinstance(item, list) and item:
                out.append(pad + '-\n' + dump_yaml(item, indent + 1))
            else:
                out.append(pad + '- ' + scalar(item) + '\n')
        return ''.join(out)
    return pad + scalar(obj) + '\n'


def scalar(v, force_quote=False):
    if v is None:
        return 'null'
    if force_quote:
        return json.dumps(str(v), ensure_ascii=False)
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    s = str(v)
    if s == '' or re.fullmatch(r'\d+', s) or re.search(r'^[\s>|&*!%@`\[\{]|[:#]\s|\s$|[:#]$', s) or '\n' in s:
        return json.dumps(s, ensure_ascii=False)
    return s


# --------------------------------------------------------------------------
# cache
# --------------------------------------------------------------------------
class Cache:
    """Per-(url, ua) payload cache with a stale-grace window.

    Entries survive restarts so a client link keeps working across deploys.
    """

    def __init__(self, directory=CACHE_DIR, limit=CACHE_MAX):
        self.dir = directory
        self.limit = limit
        self.lock = threading.Lock()
        try:
            os.makedirs(self.dir, mode=0o700, exist_ok=True)
        except OSError:
            self.dir = os.path.join(tempfile.gettempdir(), 'subconv-cache')
            os.makedirs(self.dir, mode=0o700, exist_ok=True)

    def path(self, key):
        return os.path.join(self.dir, hashlib.sha256(key.encode()).hexdigest()[:32] + '.json')

    def get(self, key):
        with self.lock:
            try:
                with open(self.path(key), encoding='utf8') as f:
                    return json.load(f)
            except (FileNotFoundError, json.JSONDecodeError, OSError):
                return None

    def put(self, key, entry):
        payload = json.dumps(entry, separators=(',', ':'))
        if len(payload.encode()) > MAX_BYTES:
            return
        with self.lock:
            parent = os.path.dirname(self.path(key))
            fd, tmp = tempfile.mkstemp(dir=parent, prefix='.c-', text=True)
            try:
                with os.fdopen(fd, 'w', encoding='utf8') as f:
                    f.write(payload)
                os.chmod(tmp, 0o600)
                os.replace(tmp, self.path(key))
            except OSError:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                return
            self._evict_locked()

    def _evict_locked(self):
        try:
            names = [n for n in os.listdir(self.dir) if n.endswith('.json')]
        except OSError:
            return
        if len(names) <= self.limit:
            return
        stats = []
        for n in names:
            p = os.path.join(self.dir, n)
            try:
                stats.append((os.path.getmtime(p), p))
            except OSError:
                pass
        stats.sort()
        for _, p in stats[:len(names) - self.limit]:
            try:
                os.unlink(p)
            except OSError:
                pass




# --------------------------------------------------------------------------
# upstream fetch with UA fallback
# --------------------------------------------------------------------------
def http_get(url, ua, timeout=25):
    req = urllib.request.Request(url, headers={
        'User-Agent': ua,
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
    })
    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ctx))
    with opener.open(req, timeout=timeout) as res:
        data = res.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('response exceeds 8MB')
        hdrs = res.headers
        return data, hdrs.get('Content-Type', 'text/plain; charset=utf-8'), \
            hdrs.get('Subscription-Userinfo'), hdrs.get('Profile-Title')


def decode_bytes(data, ctype):
    m = re.search(r'charset=([\w-]+)', ctype or '', re.I)
    for enc in ([m.group(1)] if m else []) + ['utf-8', 'gb18030', 'latin-1']:
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode('utf-8', 'replace')


CACHE = Cache()


def expected_format(ua):
    """Which payload shape the client behind this UA actually wants."""
    if ua in ('sing-box/1.8.0', 'karing/1.0'):
        return 'singbox'
    if ua in ('v2rayN/6.0', 'v2rayNG/1.8.0', 'Qv2ray/2.7.0',
              'v2rayA/1.0', 'Matsuri/1.0', 'FoxRay/1.0',
              'SagerNet/1.0.0', 'Kitsunebi/1.0', 'Igniter/1.0',
              'NekoBox/Android/1.2.9', 'neko-box/1.2.9',
              'V2RayU/1.0', 'V2Box/1.0', 'AnXray/1.0',
              'shadowrocket/1.0.0', 'Streisand/1.0', 'Loon/3.0',
              'Quantumult X/1.0', 'Potatso/2.0', 'Pharos/1.0',
              'FairVPN/1.0', 'NapsternetV/1.0', 'HTTPCustom/1.0',
              'Netch/1.0'):
        return 'uri'
    return 'clash'


def payload_usable(text, want):
    """True when the payload already satisfies the requesting client."""
    if not text:
        return False
    if want == 'singbox':
        return looks_like_singbox(text) and '"outbounds"' in text and text.strip() not in ('{}', '{"outbounds":[]}')
    if want == 'uri':
        return uri_count(text) > 0 or (is_base64_blob(text) and uri_count(decode_b64(text)) > 0)
    return payload_score(text) > 0


def decode_b64(text):
    import base64
    body = re.sub(r'\s+', '', (text or '').strip())
    try:
        return base64.b64decode(body + '=' * (-len(body) % 4)).decode('utf8', 'replace')
    except Exception:
        return ''


def resolve(url, ua, force=False):
    """Return a dict describing the best payload to serve for (url, ua).

    Keys: body(bytes), ctype, userinfo, title, source, ua, nodes, fetched_at,
    note. Raises RuntimeError when nothing usable is available.
    """
    want = expected_format(ua)
    key = url + '\n' + ua
    now = int(time.time())
    entry = CACHE.get(key)

    if not force and entry and entry.get('status') == 'ok' and now - entry.get('fetched_at', 0) < CACHE_TTL:
        return decode_entry(entry, 'cache', ua)

    if not force and entry and entry.get('status') == 'fail' and now - entry.get('fetched_at', 0) < NEG_TTL:
        if has_good_body(entry):
            return decode_entry(entry, 'stale-after-fail', ua)
        raise RuntimeError('upstream recently failed; retry in %ds'
                           % (NEG_TTL - (now - entry['fetched_at'])))

    chain = [ua] + [u for u in UA_CHAIN if u != ua]
    attempts = []
    best = None       # most nodes seen under any UA
    best_text = None

    for probe in chain:
        try:
            data, ctype, userinfo, title = http_get(url, probe)
        except urllib.error.HTTPError as exc:
            attempts.append('%s: HTTP %s' % (probe, exc.code))
            if exc.code in (403, 404):
                break  # the link itself is dead; other UAs will not help
            continue
        except Exception as exc:
            attempts.append('%s: %s' % (probe, type(exc).__name__))
            continue

        text = decode_bytes(data, ctype)
        score = payload_score(text)
        n_uri = uri_count(text) or uri_count(decode_b64(text))
        seen = max(score, n_uri)

        if payload_usable(text, want):
            record = make_record(data, ctype, userinfo, title, probe, now, url,
                                 detect_format(text), seen)
            CACHE.put(key, record)
            note = 'ua=%s' % probe if probe == ua else 'ua-fallback=%s' % probe
            return decode_entry(record, 'live', ua, note=note)

        if best is None or seen > best:
            best, best_text = seen, text
        attempts.append('%s: %s (nodes=%d)' % (probe, detect_format(text), seen))
        if best and best >= 3:
            break  # enough nodes to rebuild; stop probing the rest of the chain

    # Nothing matched the client's expected shape directly: convert the richest
    # payload we did see into it.
    if best_text and best and best > 0:
        built = rebuild_payload(best_text, want)
        if built:
            body, nodes, ctype = built
            record = {
                'status': 'ok', 'body': body.decode('latin-1'), 'body_len': len(body),
                'ctype': ctype, 'userinfo': None, 'title': None,
                'format': want + '-rebuilt', 'nodes': nodes, 'ua': ua,
                'fetched_at': now, 'url': url,
            }
            CACHE.put(key, record)
            return decode_entry(record, 'rebuilt', ua,
                                note='upstream gave no %s payload; rebuilt from %d nodes' % (want, nodes))

    if entry and has_good_body(entry):
        stale_age = now - entry.get('fetched_at', 0)
        if stale_age <= STALE_GRACE:
            return decode_entry(entry, 'stale', ua,
                                note='upstream failed; served cached copy (%ds old)' % stale_age)
        attempts.append('cached copy too old (%ds)' % stale_age)

    CACHE.put(key, {'status': 'fail', 'fetched_at': now, 'url': url, 'ua': ua,
                    'attempts': attempts[-8:]})
    raise RuntimeError('all upstream attempts failed: ' + ('; '.join(attempts[-4:]) or 'no attempts'))


def make_record(data, ctype, userinfo, title, probe, now, url, fmt, nodes):
    return {
        'status': 'ok',
        'body': data.decode('latin-1'), 'body_len': len(data),
        'ctype': ctype, 'userinfo': userinfo, 'title': title, 'format': fmt,
        'nodes': nodes, 'ua': probe, 'fetched_at': now, 'url': url,
    }


def detect_format(text):
    if not text:
        return 'empty'
    if looks_like_clash(text):
        return 'clash'
    if looks_like_singbox(text):
        return 'singbox'
    if is_base64_blob(text):
        return 'base64'
    if uri_count(text):
        return 'uri'
    return 'unknown'


def has_good_body(entry):
    return entry and entry.get('status') == 'ok' and entry.get('body_len', 0) > 64


def decode_entry(entry, source, requested_ua, note=None):
    body = entry['body'].encode('latin-1')
    return {
        'body': body,
        'ctype': entry.get('ctype', 'text/plain; charset=utf-8'),
        'userinfo': entry.get('userinfo'),
        'title': entry.get('title'),
        'source': source,
        'format': entry.get('format', 'unknown'),
        'nodes': entry.get('nodes', 0),
        'ua': entry.get('ua', requested_ua),
        'fetched_at': entry.get('fetched_at', 0),
        'note': note,
    }


# --------------------------------------------------------------------------
# HTTP service
# --------------------------------------------------------------------------
class App(BaseHTTPRequestHandler):
    token = ''
    store_path = '/var/lib/subconv-fetch/relays.json'

    def public_url(self, raw):
        try:
            u = urllib.parse.urlsplit(raw)
            host = u.hostname
            if u.scheme not in ('http', 'https') or not host or u.username or u.password:
                return False
            if u.port not in (None, 80, 443):
                return False
            try:
                ips = [ipaddress.ip_address(host)]
            except ValueError:
                try:
                    ips = [ipaddress.ip_address(x[4][0])
                           for x in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)]
                except socket.gaierror:
                    return False
            return bool(ips) and all(ip.is_global for ip in ips)
        except (ValueError, UnicodeError):
            return False

    def log_message(self, fmt, *args):
        # args[0] is the request line and can carry a token-bearing ?url= value.
        try:
            line = fmt % args
        except TypeError:
            line = str(fmt)
        line = re.sub(r'url=[^\s&]*', 'url=[redacted]', line)
        line = re.sub(r'token=[^\s&]*', 'token=[redacted]', line)
        print('%s - %s' % (self.address_string(), line))

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')

    def error_json(self, code, message, **extra):
        body = {'error': message}
        body.update(extra)
        self.send_response(code)
        self.send_cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(body, ensure_ascii=False).encode())

    def valid_url(self, raw):
        return self.public_url(raw)

    @classmethod
    def load_store(cls):
        try:
            with open(cls.store_path, encoding='utf8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    @classmethod
    def save_store(cls, data):
        parent = os.path.dirname(cls.store_path)
        os.makedirs(parent, mode=0o700, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=parent, prefix='.relays-', text=True)
        try:
            with os.fdopen(fd, 'w', encoding='utf8') as f:
                json.dump(data, f, separators=(',', ':'))
                f.flush()
                os.fsync(f.fileno())
            os.chmod(tmp, 0o600)
            os.replace(tmp, cls.store_path)
        except OSError:
            try:
                os.unlink(tmp)
            except OSError:
                raise

    def serve_payload(self, raw, ua, relay=False, tag_mode='off', target=None, options=None):
        try:
            result = resolve(raw, ua, force=False)
        except Exception as exc:
            code = 502
            msg = str(exc)
            if 'exceeds 8MB' in msg:
                code = 413
            # Never echo the upstream URL back: it carries the subscription token.
            msg = msg.replace(raw, '[upstream]')
            self.error_json(code, msg[:400])
            return

        body = result['body']
        ctype = result['ctype']
        tagged_nodes = None
        if target in CONVERT_TARGETS:
            converted = convert_payload(body, target, options, tag_mode)
            if not converted:
                self.error_json(502, '无法将上游订阅转换为目标格式')
                return
            body, ctype, tagged_nodes = converted
        elif tag_mode and tag_mode != 'off':
            body, tagged_ctype, tagged_nodes = tagged_payload(body, result.get('format'), tag_mode)
            if tagged_ctype:
                ctype = tagged_ctype
        age = int(time.time()) - result.get('fetched_at', 0)

        self.send_response(200)
        if not relay:
            self.send_cors()
        self.send_header('Content-Type', ctype)
        # Always no-store on the wire. BT panel's global proxy.conf enables
        # proxy_cache with no proxy_cache_valid, so nginx honours whatever
        # Cache-Control we send — a public max-age here would freeze a relay
        # link for minutes and hide upstream updates. Dedup against the
        # upstream is done by the application cache (CACHE_TTL), not by proxies.
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Expires', '0')
        self.send_header('Pragma', 'no-cache')
        if result.get('userinfo'):
            self.send_header('Subscription-Userinfo', result['userinfo'])
        if result.get('title'):
            self.send_header('Profile-Title', result['title'])
        self.send_header('X-Subconv-Source', result['source'])
        self.send_header('X-Subconv-Format', str(target or result.get('format')))
        self.send_header('X-Subconv-Nodes', str(tagged_nodes or result.get('nodes')))
        if target in CONVERT_TARGETS:
            self.send_header('X-Subconv-Converted', 'true')
        if tag_mode and tag_mode != 'off':
            self.send_header('X-Subconv-NameTag', tag_mode)
        self.send_header('X-Subconv-Upstream-UA', result.get('ua', ''))
        self.send_header('X-Subconv-Age', str(age))
        if result.get('note'):
            self.send_header('X-Subconv-Note',
                             urllib.parse.quote(str(result['note'])[:180]))
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        p = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(p.query)

        if p.path == '/health':
            self.send_response(200)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'ok': True, 'converter': CV_OK,
                'converter_error': None if CV_OK else globals().get('CV_ERR'),
                'cache_dir': CACHE.dir,
            }).encode())
            return

        if p.path.startswith('/sub/'):
            rid = p.path[5:].split('?')[0]
            if not rid or '/' in rid:
                self.error_json(404, 'relay not found')
                return
            rec = self.load_store().get(rid)
            if not rec:
                self.error_json(404, 'relay not found')
                return
            ua = q.get('ua', [None])[0] or rec.get('ua', DEFAULT_UA)
            if ua not in USER_AGENTS:
                ua = rec.get('ua', DEFAULT_UA)
            tag_mode = q.get('tag', [None])[0] or q.get('nametag', [None])[0] or rec.get('tag', 'off')
            if tag_mode not in TAG_MODES:
                tag_mode = rec.get('tag', 'off')
            target = rec.get('target')
            options = rec.get('options', {})
            self.serve_payload(rec['url'], ua, relay=True, tag_mode=tag_mode,
                               target=target, options=options)
            return

        if p.path.startswith('/substat/'):
            rid = p.path[9:]
            if not rid or '/' in rid:
                self.error_json(404, 'relay not found')
                return
            rec = self.load_store().get(rid)
            if not rec:
                self.error_json(404, 'relay not found')
                return
            ua = rec.get('ua', DEFAULT_UA)
            entry = CACHE.get(rec['url'] + '\n' + ua) or {}
            self.send_response(200)
            self.send_cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            safe = dict(entry)
            safe.pop('body', None)
            # The upstream URL embeds the subscription token; never expose it.
            safe.pop('url', None)
            safe.pop('attempts', None)
            safe['relay_ua'] = ua
            safe['ttl'] = CACHE_TTL
            self.wfile.write(json.dumps(safe, ensure_ascii=False).encode())
            return

        if p.path not in ('/fetch', '/create'):
            self.error_json(404, 'use /fetch, /create, /sub/<id>, /substat/<id> or /health')
            return
        if not self.token or q.get('token', [''])[0] != self.token:
            self.error_json(401, 'invalid token')
            return

        raw = q.get('url', [''])[0]
        ua = q.get('ua', [DEFAULT_UA])[0]
        tag_mode = q.get('tag', [None])[0] or q.get('nametag', ['off'])[0]
        if tag_mode not in TAG_MODES:
            tag_mode = 'off'
        target = q.get('target', [''])[0].lower()
        if target == 'v2ray':
            target = 'uri'
        if target and target not in CONVERT_TARGETS:
            self.error_json(400, 'unsupported conversion target')
            return
        options = {}
        raw_options = q.get('options', [''])[0]
        if raw_options:
            try:
                parsed_options = json.loads(raw_options)
                if isinstance(parsed_options, dict):
                    options = {str(k): bool(v) for k, v in parsed_options.items()
                               if str(k) in CONVERT_OPTIONS}
            except (TypeError, ValueError):
                self.error_json(400, 'invalid conversion options')
                return
        if not self.valid_url(raw):
            self.error_json(403, 'invalid or non-allowlisted subscription URL')
            return
        if ua not in USER_AGENTS:
            ua = DEFAULT_UA

        if p.path == '/fetch':
            self.serve_payload(raw, ua, tag_mode=tag_mode)
            return

        store = self.load_store()
        rid = secrets.token_urlsafe(32)
        record = {'url': raw, 'ua': ua, 'tag': tag_mode, 'created': int(time.time())}
        if target:
            record['target'] = target
            record['options'] = options
        store[rid] = record
        self.save_store(store)
        self.send_response(201)
        self.send_cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps({'id': rid}).encode())


def main():
    global CACHE, CACHE_TTL
    a = argparse.ArgumentParser()
    a.add_argument('--host', default='127.0.0.1')
    a.add_argument('--port', type=int, default=8787)
    a.add_argument('--cache-dir', default=CACHE_DIR)
    a.add_argument('--ttl', type=int, default=None)
    x = a.parse_args()

    if x.ttl:
        CACHE_TTL = x.ttl
    CACHE = Cache(x.cache_dir)

    token = os.environ.get('SUBCONV_PROXY_TOKEN', '')
    if not token:
        a.error('set SUBCONV_PROXY_TOKEN')
    App.token = token

    print('Listening on http://%s:%s; cache=%s ttl=%ss converter=%s'
          % (x.host, x.port, CACHE.dir, CACHE_TTL, CV_OK))
    ThreadingHTTPServer((x.host, x.port), App).serve_forever()


if __name__ == '__main__':
    main()
