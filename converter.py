#!/usr/bin/env python3
"""
订阅转换工具 - SubConv
支持通用订阅转换为 Clash/V2Ray/SingBox 等格式
"""

import json
import yaml
import base64
import urllib.parse
import re
import hashlib
from datetime import datetime, timezone
from typing import Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum


class Protocol(Enum):
    VMess = "vmess"
    VLESS = "vless"
    Trojan = "trojan"
    Shadowsocks = "ss"
    Hysteria2 = "hysteria2"
    Tuic = "tuic"
    WireGuard = "wireguard"
    HTTP = "http"
    SOCKS5 = "socks5"


@dataclass
class Node:
    name: str
    protocol: Protocol
    server: str
    port: int
    uuid: Optional[str] = None
    password: Optional[str] = None
    method: Optional[str] = None
    sni: Optional[str] = None
    network: Optional[str] = None
    path: Optional[str] = None
    host: Optional[str] = None
    security: Optional[str] = None
    flow: Optional[str] = None
    alpn: Optional[list] = None
    fingerprint: Optional[str] = None
    allow_insecure: bool = False
    skip_cert_verify: bool = False
    servername: Optional[str] = None
    obfs: Optional[str] = None
    obfs_password: Optional[str] = None
    # Hysteria2
    obfs_type: Optional[str] = None
    # Tuic
    congestion_control: Optional[str] = None
    udp_relay_mode: Optional[str] = None
    # WireGuard
    private_key: Optional[str] = None
    peer_public_key: Optional[str] = None
    pre_shared_key: Optional[str] = None
    local_address: Optional[list] = None
    mtu: Optional[int] = None
    reserved: Optional[list] = None
    # Extra
    tls: bool = False
    reality_opts: Optional[dict] = None
    grpc_service_name: Optional[str] = None
    headers: Optional[dict] = None
    tags: Optional[list] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class SubscriptionInfo:
    """Subscription account metadata returned by common providers."""
    upload: int = 0
    download: int = 0
    total: int = 0
    expire: Optional[int] = None
    title: Optional[str] = None
    update_interval: Optional[int] = None
    source: str = 'unknown'

    @property
    def used(self) -> int:
        return self.upload + self.download

    @property
    def remaining(self) -> Optional[int]:
        if not self.total:
            return None
        return max(0, self.total - self.used)

    def to_dict(self) -> dict:
        data = asdict(self)
        data.update({'used': self.used, 'remaining': self.remaining,
                     'expire_iso': (datetime.fromtimestamp(self.expire, timezone.utc).isoformat()
                                    if self.expire else None)})
        return {k: v for k, v in data.items() if v is not None}


def parse_subscription_userinfo(value: str) -> SubscriptionInfo:
    """Parse upload=...; download=...; total=...; expire=... headers."""
    info = SubscriptionInfo(source='Subscription-Userinfo')
    for key, raw in re.findall(r'([A-Za-z][A-Za-z_-]*)\s*=\s*([0-9]+)', value or ''):
        key = key.lower().replace('-', '_')
        if key in ('upload', 'download', 'total'):
            setattr(info, key, int(raw))
        elif key == 'expire':
            info.expire = int(raw)
    return info


def format_bytes(value: Optional[int]) -> str:
    if value is None:
        return '未知'
    units = ('B', 'KB', 'MB', 'GB', 'TB')
    n = float(value)
    for unit in units:
        if n < 1024 or unit == units[-1]:
            return f'{n:.2f} {unit}' if unit != 'B' else f'{int(n)} B'
        n /= 1024


def parse_name_metadata(names: list[str]) -> tuple[SubscriptionInfo, set[str]]:
    """Extract common airport traffic/expiry pseudo-nodes from their names."""
    info = SubscriptionInfo(source='node-name')
    matched = set()
    remaining_value = 0
    size = r'(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|K|M|G|T)(?:B)?'
    for name in names:
        text = str(name or '').strip()
        low = text.lower()
        if not any(k in low for k in ('流量', '用量', 'traffic', 'quota', '剩余', 'used', 'total')) and not any(k in low for k in ('到期', '有效期', 'expire', 'expires', 'valid until')):
            continue
        found = False
        m = re.search(size, text, re.I)
        if m and any(k in low for k in ('流量', '用量', 'traffic', 'quota', '剩余', 'used', 'total')):
            unit = m.group(2).upper()
            power = {'B': 0, 'K': 1, 'KB': 1, 'M': 2, 'MB': 2, 'G': 3, 'GB': 3, 'T': 4, 'TB': 4}[unit]
            value = int(float(m.group(1)) * (1024 ** power))
            if any(k in low for k in ('剩余', 'remain', 'left')): remaining_value = max(remaining_value, value)
            elif any(k in low for k in ('已用', 'used', 'upload', 'download')): info.download = max(info.download, value)
            else: info.total = max(info.total, value)
            found = True
        date = re.search(r'(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})(?:日)?(?:[ T](\d{1,2})[:：](\d{2})(?::(\d{2}))?)?', text)
        if date and any(k in low for k in ('到期', '有效期', 'expire', 'expires', 'valid until')):
            from datetime import datetime as _dt
            info.expire = int(_dt(int(date.group(1)), int(date.group(2)), int(date.group(3)), int(date.group(4) or 23), int(date.group(5) or 59), int(date.group(6) or 59), tzinfo=timezone.utc).timestamp())
            found = True
        unix = re.search(r'(?<!\d)(1\d{9,})(?!\d)', text)
        if unix and any(k in low for k in ('到期', 'expire', 'expires', 'valid')):
            info.expire = int(unix.group(1)); found = True
        if found: matched.add(name)
    if remaining_value:
        info.total = max(info.total, remaining_value + info.used)
    if info.total or info.used or info.expire:
        return info, matched
    return SubscriptionInfo(source='unknown'), set()


class SubscriptionParser:
    """解析各种订阅格式"""

    @staticmethod
    def parse_base64_subscription(content: str) -> list[str]:
        """解析 Base64 编码的 URI 列表"""
        try:
            decoded = base64.urlsafe_b64decode(content + '=' * (-len(content) % 4)).decode('utf-8')
            return [line.strip() for line in decoded.split('\n') if line.strip()]
        except:
            return []

    @staticmethod
    def parse_clash_yaml(content: str) -> list[dict]:
        """解析 Clash YAML 配置"""
        try:
            config = yaml.safe_load(content)
            return config.get('proxies', [])
        except:
            return []

    @staticmethod
    def parse_singbox_json(content: str) -> list[dict]:
        """解析 SingBox JSON 配置"""
        try:
            config = json.loads(content)
            return config.get('outbounds', [])
        except:
            return []

    @staticmethod
    def get_fragment_name(fragment: str) -> str:
        """从 URI fragment 提取节点名（可能带有 ? 后缀参数或 URL 编码）"""
        if not fragment:
            return ''
        name = fragment.split('?')[0]
        try:
            name = urllib.parse.unquote(name, errors='replace')
        except Exception:
            pass
        return name.strip()

    @staticmethod
    def parse_uri(uri: str) -> Optional[Node]:
        """解析单个 URI 为 Node 对象"""
        uri = uri.strip()
        if not uri or '://' not in uri:
            return None

        protocol = uri.split('://')[0].lower()

        try:
            if protocol == 'vmess':
                return SubscriptionParser.parse_vmess(uri)
            elif protocol == 'vless':
                return SubscriptionParser.parse_vless(uri)
            elif protocol == 'trojan':
                return SubscriptionParser.parse_trojan(uri)
            elif protocol in ['ss', 'shadowsocks']:
                return SubscriptionParser.parse_shadowsocks(uri)
            elif protocol == 'hysteria2':
                return SubscriptionParser.parse_hysteria2(uri)
            elif protocol == 'tuic':
                return SubscriptionParser.parse_tuic(uri)
            elif protocol == 'wireguard':
                return SubscriptionParser.parse_wireguard(uri)
            elif protocol in ['http', 'https']:
                return SubscriptionParser.parse_http(uri)
        except Exception as e:
            pass
            return None

        return None

    @staticmethod
    def parse_vmess(uri: str) -> Optional[Node]:
        """解析 VMess URI"""
        try:
            # vmess://base64(json)
            b64_content = uri[8:]
            json_str = base64.urlsafe_b64decode(b64_content + '=' * (-len(b64_content) % 4)).decode('utf-8')
            data = json.loads(json_str)

            return Node(
                name=data.get('ps', data.get('name', 'VMess')),
                protocol=Protocol.VMess,
                server=data.get('add', ''),
                port=int(data.get('port', 443)),
                uuid=data.get('id', ''),
                method=data.get('scy', 'auto'),
                network=data.get('net', 'tcp'),
                path=data.get('path', '/'),
                host=data.get('host', ''),
                security=data.get('tls', '') or 'none',
                fingerprint=data.get('fp', 'chrome'),
                alpn=data.get('alpn', ['h2', 'http/1.1']) if isinstance(data.get('alpn'), str) else data.get('alpn'),
                skip_cert_verify=data.get('verify_cert', True) is False or data.get('allowInsecure', False),
                grpc_service_name=data.get('path', '') if data.get('net') == 'grpc' else None,
                headers={'Host': data.get('host', '')} if data.get('host') else None,
            )
        except Exception as e:
            print(f"VMess 解析错误: {e}")
            return None

    @staticmethod
    def parse_vless(uri: str) -> Optional[Node]:
        """解析 VLESS URI"""
        try:
            # vless://uuid@host:port?params
            parsed = urllib.parse.urlparse(uri)
            uuid = parsed.username or ''
            server = parsed.hostname or ''
            port = parsed.port or 443

            params = urllib.parse.parse_qs(parsed.query)
            params = {k: v[0] if len(v) == 1 else v for k, v in params.items()}

            security = params.get('security', 'none')
            network = params.get('type', 'tcp')
            frag = SubscriptionParser.get_fragment_name(parsed.fragment)

            return Node(
                name=frag or params.get('remarks', params.get('name', 'VLESS')),
                protocol=Protocol.VLESS,
                server=server,
                port=port,
                uuid=uuid,
                flow=params.get('flow', ''),
                security=security,
                network=network,
                path=params.get('path', '/'),
                host=params.get('host', params.get('sni', '')),
                sni=params.get('sni', ''),
                fingerprint=params.get('fp', 'chrome'),
                alpn=params.get('alpn', 'h2,http/1.1').split(',') if params.get('alpn') else None,
                allow_insecure=params.get('allowInsecure', '0') == '1',
                reality_opts={
                    'public_key': params.get('pbk', ''),
                    'short_id': params.get('sid', ''),
                } if security == 'reality' else None,
                grpc_service_name=params.get('serviceName', '') if network == 'grpc' else None,
                headers={'Host': params.get('host', '')} if params.get('host') else None,
            )
        except Exception as e:
            print(f"VLESS 解析错误: {e}")
            return None

    @staticmethod
    def parse_trojan(uri: str) -> Optional[Node]:
        """解析 Trojan URI"""
        try:
            # trojan://password@host:port?params
            parsed = urllib.parse.urlparse(uri)
            password = urllib.parse.unquote(parsed.username or '')
            server = parsed.hostname or ''
            port = parsed.port or 443

            params = urllib.parse.parse_qs(parsed.query)
            params = {k: v[0] if len(v) == 1 else v for k, v in params.items()}

            frag = urllib.parse.unquote(parsed.fragment or '').split('?')[0]
            return Node(
                name=frag or params.get('remarks', params.get('name', 'Trojan')),
                protocol=Protocol.Trojan,
                server=server,
                port=port,
                password=password,
                security=params.get('security', 'tls'),
                sni=params.get('sni', server),
                network=params.get('type', 'tcp'),
                path=params.get('path', '/'),
                host=params.get('host', ''),
                fingerprint=params.get('fp', 'chrome'),
                alpn=params.get('alpn', 'h2,http/1.1').split(',') if params.get('alpn') else None,
                allow_insecure=params.get('allowInsecure', '0') == '1',
                grpc_service_name=params.get('serviceName', '') if params.get('type') == 'grpc' else None,
            )
        except Exception as e:
            print(f"Trojan 解析错误: {e}")
            return None

    @staticmethod
    def parse_shadowsocks(uri: str) -> Optional[Node]:
        """解析 Shadowsocks URI"""
        try:
            # ss://base64(method:password@host:port#name)
            # 或 ss://base64(method:password)@host:port#name
            # 或 ss://method:password@host:port#name
            parsed = urllib.parse.urlparse(uri)
            netloc = parsed.netloc

            # 检查是否整体 base64 编码
            if '@' not in netloc:
                try:
                    decoded = base64.b64decode(netloc + '=' * (-len(netloc) % 4)).decode('utf-8')
                    # decoded 格式：method:password@host:port#name 或 method:password@host:port
                    name = 'Shadowsocks'
                    if '#' in decoded:
                        decoded, name = decoded.rsplit('#', 1)
                        name = urllib.parse.unquote(name)
                    
                    if '@' in decoded:
                        info_part, host_port = decoded.rsplit('@', 1)
                        method, password = info_part.split(':', 1)
                        server = host_port.split(':')[0]
                        port_str = host_port.split(':')[1] if ':' in host_port else '8388'
                        port = int(port_str)
                        return Node(
                            name=name,
                            protocol=Protocol.Shadowsocks,
                            server=server,
                            port=port,
                            method=method,
                            password=password,
                        )
                except Exception as e:
                    print(f"SS base64 解析错误：{e}")
                    pass

            # 标准格式 ss://method:password@host:port#name
            server = parsed.hostname or ''
            port = parsed.port or 8388
            name = urllib.parse.unquote(parsed.fragment or 'Shadowsocks')
            user_info = parsed.username or ''

            # 尝试解码 base64 的 method:password
            try:
                decoded = base64.urlsafe_b64decode(user_info + '=' * (-len(user_info) % 4)).decode('utf-8')
                method, password = decoded.split(':', 1)
            except:
                method = user_info
                password = urllib.parse.unquote(parsed.password or '')

            # 检查插件
            params = urllib.parse.parse_qs(parsed.query)
            plugin = params.get('plugin', [''])[0]

            return Node(
                name=name,
                protocol=Protocol.Shadowsocks,
                server=server,
                port=port,
                method=method,
                password=password,
                obfs=plugin.split(';')[0] if plugin else None,
                obfs_password=plugin.split(';')[1] if plugin and ';' in plugin else None,
            )
        except Exception as e:
            print(f"Shadowsocks 解析错误：{e}")
            return None


    @staticmethod
    def parse_hysteria2(uri: str) -> Optional[Node]:
        """解析 Hysteria2 URI"""
        try:
            # hysteria2://uuid@host:port?params
            parsed = urllib.parse.urlparse(uri)
            uuid = urllib.parse.unquote(parsed.username or '')
            server = parsed.hostname or ''
            port = parsed.port or 443

            params = urllib.parse.parse_qs(parsed.query)
            params = {k: v[0] if len(v) == 1 else v for k, v in params.items()}

            frag = urllib.parse.unquote(parsed.fragment or '').split('?')[0]
            return Node(
                name=frag or params.get('remarks', params.get('name', 'Hysteria2')),
                protocol=Protocol.Hysteria2,
                server=server,
                port=port,
                password=uuid,
                sni=params.get('sni', server),
                alpn=params.get('alpn', 'h3').split(',') if params.get('alpn') else ['h3'],
                allow_insecure=params.get('insecure', '0') == '1',
                obfs_type=params.get('obfs', ''),
                obfs_password=params.get('obfs-password', ''),
            )
        except Exception as e:
            print(f"Hysteria2 解析错误: {e}")
            return None

    @staticmethod
    def parse_tuic(uri: str) -> Optional[Node]:
        """解析 Tuic URI"""
        try:
            # tuic://uuid:password@host:port?params
            parsed = urllib.parse.urlparse(uri)
            uuid = urllib.parse.unquote(parsed.username or '')
            password = urllib.parse.unquote(parsed.password or '')
            server = parsed.hostname or ''
            port = parsed.port or 443

            params = urllib.parse.parse_qs(parsed.query)
            params = {k: v[0] if len(v) == 1 else v for k, v in params.items()}

            frag = urllib.parse.unquote(parsed.fragment or '').split('?')[0]
            return Node(
                name=frag or params.get('remarks', params.get('name', 'Tuic')),
                protocol=Protocol.Tuic,
                server=server,
                port=port,
                uuid=uuid,
                password=password,
                congestion_control=params.get('congestion_control', 'bbr'),
                udp_relay_mode=params.get('udp_relay_mode', 'native'),
                alpn=params.get('alpn', 'h3').split(',') if params.get('alpn') else ['h3'],
                allow_insecure=params.get('allow_insecure', '0') == '1',
            )
        except Exception as e:
            print(f"Tuic 解析错误: {e}")
            return None

    @staticmethod
    def parse_wireguard(uri: str) -> Optional[Node]:
        """解析 WireGuard URI"""
        try:
            # wireguard://private_key@host:port?params
            parsed = urllib.parse.urlparse(uri)
            private_key = urllib.parse.unquote(parsed.username or '')
            server = parsed.hostname or ''
            port = parsed.port or 51820

            params = urllib.parse.parse_qs(parsed.query)
            params = {k: v[0] if len(v) == 1 else v for k, v in params.items()}

            addresses = params.get('address', ['10.0.0.2/32'])
            if isinstance(addresses, str):
                addresses = [addresses]

            reserved = params.get('reserved', ['0,0,0'])
            if isinstance(reserved, str):
                reserved = [int(x) for x in reserved[0].split(',')]

            return Node(
                name=params.get('remarks', params.get('name', 'WireGuard')),
                protocol=Protocol.WireGuard,
                server=server,
                port=port,
                private_key=private_key,
                peer_public_key=params.get('public_key', ''),
                pre_shared_key=params.get('preshared_key', ''),
                local_address=addresses,
                mtu=int(params.get('mtu', 1420)),
                reserved=reserved,
            )
        except Exception as e:
            print(f"WireGuard 解析错误: {e}")
            return None

    @staticmethod
    def parse_http(uri: str) -> Optional[Node]:
        """解析 HTTP/HTTPS URI"""
        try:
            # http://user:pass@host:port#name
            parsed = urllib.parse.urlparse(uri)
            server = parsed.hostname or ''
            port = parsed.port or (443 if parsed.scheme == 'https' else 80)
            name = urllib.parse.unquote(parsed.fragment or 'HTTP')

            return Node(
                name=name,
                protocol=Protocol.HTTP if parsed.scheme == 'https' else Protocol.SOCKS5,
                server=server,
                port=port,
                tls=parsed.scheme == 'https',
            )
        except Exception as e:
            print(f"HTTP 解析错误: {e}")
            return None


def clean_nulls(obj):
    """递归剔除 None / 空字典 / 空列表字段"""
    if isinstance(obj, dict):
        cleaned = {k: clean_nulls(v) for k, v in obj.items() if v is not None}
        return {k: v for k, v in cleaned.items() if v != {} and v != []}
    if isinstance(obj, list):
        return [clean_nulls(i) for i in obj if i is not None]
    return obj


class ClashConverter:
    """转换为 Clash 格式"""

    @staticmethod
    def convert(nodes: list[Node], config_template: Optional[dict] = None) -> dict:
        """将 Node 列表转换为 Clash 配置"""
        proxies = []
        for node in nodes:
            proxy = ClashConverter.node_to_clash(node)
            if proxy:
                proxies.append(proxy)

        default_config = {
            'mixed-port': 7890,
            'allow-lan': False,
            'mode': 'rule',
            'log-level': 'info',
            'dns': {
                'enable': True,
                'nameserver': ['1.1.1.1', '8.8.8.8'],
            },
            'proxies': proxies,
            'proxy-groups': [
                {
                    'name': '🚀 节点选择',
                    'type': 'select',
                    'proxies': ['AUTO', 'DIRECT'] + [p.get('name', '') for p in proxies[:50]],
                },
                {
                    'name': 'AUTO',
                    'type': 'url-test',
                    'url': 'http://www.gstatic.com/generate_204',
                    'interval': 300,
                    'proxies': [p.get('name', '') for p in proxies[:50]],
                },
                {
                    'name': '🌍 国外媒体',
                    'type': 'select',
                    'proxies': ['🚀 节点选择', 'AUTO', 'DIRECT'],
                },
                {
                    'name': '🎯 全球直连',
                    'type': 'select',
                    'proxies': ['DIRECT', '🚀 节点选择'],
                },
            ],
            'rules': [
                'GEOIP,LAN,DIRECT',
                'GEOIP,CN,DIRECT',
                'MATCH,🚀 节点选择',
            ],
        }

        if config_template:
            default_config.update(config_template)
            default_config['proxies'] = proxies
            # 更新 proxy-groups 中的节点列表
            for group in default_config.get('proxy-groups', []):
                if 'AUTO' in group.get('proxies', []) or 'DIRECT' in group.get('proxies', []):
                    continue
                group['proxies'] = [p.get('name', '') for p in proxies[:50]]

        return default_config

    @staticmethod
    def node_to_clash(node: Node) -> Optional[dict]:
        """将单个 Node 转换为 Clash 代理配置"""
        try:
            if node.protocol == Protocol.VMess:
                return {
                    'name': node.name,
                    'type': 'vmess',
                    'server': node.server,
                    'port': node.port,
                    'uuid': node.uuid,
                    'alterId': 0,
                    'cipher': node.method or 'auto',
                    'tls': node.security == 'tls',
                    'network': node.network,
                    'ws-path': node.path if node.network == 'ws' else None,
                    'ws-headers': {'Host': node.host} if node.host and node.network == 'ws' else None,
                    'servername': node.sni or node.host,
                    'skip-cert-verify': node.skip_cert_verify or node.allow_insecure,
                    'fingerprint': node.fingerprint,
                    'alpn': node.alpn,
                }
            elif node.protocol == Protocol.VLESS:
                return {
                    'name': node.name,
                    'type': 'vless',
                    'server': node.server,
                    'port': node.port,
                    'uuid': node.uuid,
                    'network': node.network,
                    'tls': node.security in ['tls', 'reality'],
                    'flow': node.flow,
                    'udp': True,
                    'skip-cert-verify': node.allow_insecure,
                    'servername': node.sni,
                    'fingerprint': node.fingerprint,
                    'alpn': node.alpn,
                    'reality-opts': ({'public-key': node.reality_opts.get('public_key'),
                                    'short-id': node.reality_opts.get('short_id')}
                                   if node.reality_opts else None),
                    'ws-opts': {'path': node.path, 'headers': node.headers} if node.network == 'ws' else None,
                    'grpc-opts': {'grpc-service-name': node.grpc_service_name} if node.network == 'grpc' else None,
                }
            elif node.protocol == Protocol.Trojan:
                return {
                    'name': node.name,
                    'type': 'trojan',
                    'server': node.server,
                    'port': node.port,
                    'password': node.password,
                    'network': node.network,
                    'sni': node.sni,
                    'alpn': node.alpn,
                    'skip-cert-verify': node.allow_insecure,
                    'fingerprint': node.fingerprint,
                    'ws-opts': {'path': node.path, 'headers': node.headers} if node.network == 'ws' else None,
                    'grpc-opts': {'grpc-service-name': node.grpc_service_name} if node.network == 'grpc' else None,
                }
            elif node.protocol == Protocol.Shadowsocks:
                proxy = {
                    'name': node.name,
                    'type': 'ss',
                    'server': node.server,
                    'port': node.port,
                    'cipher': node.method,
                    'password': node.password,
                }
                if node.obfs:
                    proxy['plugin'] = node.obfs
                    if node.obfs_password:
                        proxy['plugin-opts'] = {'password': node.obfs_password}
                return proxy
            elif node.protocol == Protocol.Hysteria2:
                return {
                    'name': node.name,
                    'type': 'hysteria2',
                    'server': node.server,
                    'port': node.port,
                    'password': node.password,
                    'sni': node.sni,
                    'alpn': node.alpn,
                    'skip-cert-verify': node.allow_insecure,
                    'obfs': node.obfs_type,
                    'obfs-password': node.obfs_password,
                }
            elif node.protocol == Protocol.Tuic:
                return {
                    'name': node.name,
                    'type': 'tuic',
                    'server': node.server,
                    'port': node.port,
                    'uuid': node.uuid,
                    'password': node.password,
                    'congestion-controller': node.congestion_control,
                    'udp-relay-mode': node.udp_relay_mode,
                    'alpn': node.alpn,
                    'skip-cert-verify': node.allow_insecure,
                }
            elif node.protocol == Protocol.WireGuard:
                return {
                    'name': node.name,
                    'type': 'wireguard',
                    'server': node.server,
                    'port': node.port,
                    'private-key': node.private_key,
                    'public-key': node.peer_public_key,
                    'preshared-key': node.pre_shared_key,
                    'ip': node.local_address[0].split('/')[0] if node.local_address else '10.0.0.2',
                    'mtu': node.mtu,
                    'reserved': node.reserved,
                }
        except Exception as e:
            print(f"Clash 转换错误 {node.protocol.value}: {e}")
            return None
        return None


class SingBoxConverter:
    """转换为 SingBox 格式"""

    @staticmethod
    def convert(nodes: list[Node]) -> dict:
        """将 Node 列表转换为 SingBox 配置"""
        outbounds = []
        for node in nodes:
            outbound = SingBoxConverter.node_to_singbox(node)
            if outbound:
                outbounds.append(outbound)

        return {
            'log': {'level': 'info'},
            'dns': {
                'servers': [
                    {'tag': 'google', 'address': '8.8.8.8'},
                    {'tag': 'local', 'address': '223.5.5.5', 'detour': 'DIRECT'},
                ],
                'rules': [
                    {'outbound': 'any', 'server': 'google'},
                    {'clash_mode': 'direct', 'server': 'local'},
                ],
            },
            'inbounds': [
                {
                    'type': 'mixed',
                    'tag': 'mixed-in',
                    'listen': '127.0.0.1',
                    'listen_port': 2080,
                },
                {
                    'type': 'tun',
                    'tag': 'tun-in',
                    'interface_name': 'singbox',
                    'inet4_address': '172.19.0.1/30',
                    'auto_route': True,
                    'strict_route': True,
                    'sniff': True,
                },
            ],
            'outbounds': [
                {
                    'type': 'selector',
                    'tag': 'proxy',
                    'outbounds': ['auto', 'direct'] + [o.get('tag', '') for o in outbounds[:50]],
                },
                {
                    'type': 'urltest',
                    'tag': 'auto',
                    'outbounds': [o.get('tag', '') for o in outbounds[:50]],
                    'url': 'http://www.gstatic.com/generate_204',
                    'interval': '3m',
                },
                {'type': 'direct', 'tag': 'direct'},
                {'type': 'block', 'tag': 'block'},
            ] + outbounds,
            'route': {
                'rules': [
                    {'ip_is_private': True, 'outbound': 'direct'},
                    {'clash_mode': 'direct', 'outbound': 'direct'},
                    {'clash_mode': 'global', 'outbound': 'proxy'},
                    {'outbound': 'any', 'server': 'local'},
                ],
                'auto_detect_interface': True,
            },
            'experimental': {
                'clash_api': {
                    'external_controller': '127.0.0.1:9090',
                    'external_ui': 'ui',
                },
            },
        }

    @staticmethod
    def node_to_singbox(node: Node) -> Optional[dict]:
        """将单个 Node 转换为 SingBox 出站配置"""
        try:
            if node.protocol == Protocol.VMess:
                return {
                    'type': 'vmess',
                    'tag': node.name,
                    'server': node.server,
                    'server_port': node.port,
                    'uuid': node.uuid,
                    'security': node.method or 'auto',
                    'transport': {
                        'type': node.network,
                        'path': node.path,
                        'headers': {'Host': node.host} if node.host else None,
                    } if node.network in ['ws', 'http', 'grpc'] else None,
                    'tls': {
                        'enabled': node.security == 'tls',
                        'server_name': node.sni or node.host,
                        'insecure': node.allow_insecure,
                        'alpn': node.alpn,
                        'utls': {
                            'enabled': True,
                            'fingerprint': node.fingerprint,
                        },
                    } if node.security == 'tls' else None,
                }
            elif node.protocol == Protocol.VLESS:
                return {
                    'type': 'vless',
                    'tag': node.name,
                    'server': node.server,
                    'server_port': node.port,
                    'uuid': node.uuid,
                    'flow': node.flow,
                    'transport': {
                        'type': node.network,
                        'path': node.path,
                        'headers': {'Host': node.host} if node.host else None,
                        'service_name': node.grpc_service_name,
                    } if node.network in ['ws', 'http', 'grpc'] else None,
                    'tls': {
                        'enabled': node.security in ['tls', 'reality'],
                        'server_name': node.sni,
                        'insecure': node.allow_insecure,
                        'alpn': node.alpn,
                        'utls': {
                            'enabled': True,
                            'fingerprint': node.fingerprint,
                        },
                        'reality': {
                            'enabled': True,
                            'public_key': node.reality_opts.get('public_key', '') if node.reality_opts else '',
                            'short_id': node.reality_opts.get('short_id', '') if node.reality_opts else '',
                        } if node.security == 'reality' else None,
                    } if node.security in ['tls', 'reality'] else None,
                }
            elif node.protocol == Protocol.Trojan:
                return {
                    'type': 'trojan',
                    'tag': node.name,
                    'server': node.server,
                    'server_port': node.port,
                    'password': node.password,
                    'transport': {
                        'type': node.network,
                        'path': node.path,
                        'headers': {'Host': node.host} if node.host else None,
                        'service_name': node.grpc_service_name,
                    } if node.network in ['ws', 'http', 'grpc'] else None,
                    'tls': {
                        'enabled': True,
                        'server_name': node.sni,
                        'insecure': node.allow_insecure,
                        'alpn': node.alpn,
                        'utls': {
                            'enabled': True,
                            'fingerprint': node.fingerprint,
                        },
                    },
                }
            elif node.protocol == Protocol.Shadowsocks:
                return {
                    'type': 'shadowsocks',
                    'tag': node.name,
                    'server': node.server,
                    'server_port': node.port,
                    'method': node.method,
                    'password': node.password,
                }
            elif node.protocol == Protocol.Hysteria2:
                return {
                    'type': 'hysteria2',
                    'tag': node.name,
                    'server': node.server,
                    'server_port': node.port,
                    'password': node.password,
                    'tls': {
                        'enabled': True,
                        'server_name': node.sni,
                        'insecure': node.allow_insecure,
                        'alpn': node.alpn,
                    },
                    'obfs': {
                        'type': node.obfs_type,
                        'password': node.obfs_password,
                    } if node.obfs_type else None,
                }
            elif node.protocol == Protocol.Tuic:
                return {
                    'type': 'tuic',
                    'tag': node.name,
                    'server': node.server,
                    'server_port': node.port,
                    'uuid': node.uuid,
                    'password': node.password,
                    'congestion_control': node.congestion_control,
                    'udp_relay_mode': node.udp_relay_mode,
                    'tls': {
                        'enabled': True,
                        'server_name': node.sni,
                        'insecure': node.allow_insecure,
                        'alpn': node.alpn,
                    },
                }
            elif node.protocol == Protocol.WireGuard:
                return {
                    'type': 'wireguard',
                    'tag': node.name,
                    'server': node.server,
                    'server_port': node.port,
                    'local_address': node.local_address,
                    'private_key': node.private_key,
                    'peer_public_key': node.peer_public_key,
                    'pre_shared_key': node.pre_shared_key,
                    'mtu': node.mtu,
                    'reserved': node.reserved,
                }
        except Exception as e:
            print(f"SingBox 转换错误 {node.protocol.value}: {e}")
            return None
        return None


class V2RayConverter:
    """转换为 V2Ray URI 格式"""

    @staticmethod
    def convert(nodes: list[Node]) -> str:
        """将 Node 列表转换为 V2Ray URI 列表（Base64 编码）"""
        uris = []
        for node in nodes:
            uri = V2RayConverter.node_to_uri(node)
            if uri:
                uris.append(uri)

        # Base64 编码
        content = '\n'.join(uris)
        return base64.b64encode(content.encode('utf-8')).decode('utf-8')

    @staticmethod
    def node_to_uri(node: Node) -> Optional[str]:
        """将单个 Node 转换为 URI"""
        try:
            if node.protocol == Protocol.VMess:
                vmess_data = {
                    'v': '2',
                    'ps': node.name,
                    'add': node.server,
                    'port': str(node.port),
                    'id': node.uuid,
                    'aid': '0',
                    'scy': node.method,
                    'net': node.network,
                    'type': 'none',
                    'host': node.host,
                    'path': node.path,
                    'tls': 'tls' if node.security == 'tls' else '',
                    'fp': node.fingerprint,
                    'alpn': ','.join(node.alpn) if node.alpn else '',
                    'sni': node.sni or node.host,
                }
                json_str = json.dumps(vmess_data)
                b64 = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
                return f"vmess://{b64}"

            elif node.protocol == Protocol.VLESS:
                params = {
                    'type': node.network,
                    'security': node.security,
                    'remarks': node.name,
                }
                if node.security == 'tls':
                    params.update({
                        'sni': node.sni,
                        'fp': node.fingerprint,
                        'alpn': ','.join(node.alpn) if node.alpn else '',
                    })
                elif node.security == 'reality':
                    params.update({
                        'sni': node.sni,
                        'fp': node.fingerprint,
                        'pbk': node.reality_opts.get('public_key', '') if node.reality_opts else '',
                        'sid': node.reality_opts.get('short_id', '') if node.reality_opts else '',
                    })
                if node.network == 'ws':
                    params['path'] = node.path
                    params['host'] = node.host
                elif node.network == 'grpc':
                    params['serviceName'] = node.grpc_service_name
                if node.flow:
                    params['flow'] = node.flow

                query = urllib.parse.urlencode(params)
                return f"vless://{node.uuid}@{node.server}:{node.port}?{query}"

            elif node.protocol == Protocol.Trojan:
                params = {
                    'type': node.network,
                    'security': 'tls',
                    'sni': node.sni,
                    'remarks': node.name,
                    'fp': node.fingerprint,
                    'alpn': ','.join(node.alpn) if node.alpn else '',
                }
                if node.network == 'ws':
                    params['path'] = node.path
                    params['host'] = node.host
                elif node.network == 'grpc':
                    params['serviceName'] = node.grpc_service_name

                query = urllib.parse.urlencode(params)
                password = urllib.parse.quote(node.password)
                return f"trojan://{password}@{node.server}:{node.port}?{query}"

            elif node.protocol == Protocol.Shadowsocks:
                method_pass = base64.b64encode(f"{node.method}:{node.password}".encode()).decode()
                name = urllib.parse.quote(node.name)
                return f"ss://{method_pass}@{node.server}:{node.port}#{name}"

            elif node.protocol == Protocol.Hysteria2:
                params = {
                    'sni': node.sni,
                    'alpn': ','.join(node.alpn) if node.alpn else 'h3',
                    'insecure': '1' if node.allow_insecure else '0',
                    'remarks': node.name,
                }
                if node.obfs_type:
                    params['obfs'] = node.obfs_type
                    params['obfs-password'] = node.obfs_password

                query = urllib.parse.urlencode(params)
                return f"hysteria2://{node.password}@{node.server}:{node.port}?{query}"

            elif node.protocol == Protocol.Tuic:
                params = {
                    'congestion_control': node.congestion_control,
                    'udp_relay_mode': node.udp_relay_mode,
                    'alpn': ','.join(node.alpn) if node.alpn else 'h3',
                    'allow_insecure': '1' if node.allow_insecure else '0',
                    'remarks': node.name,
                }
                query = urllib.parse.urlencode(params)
                return f"tuic://{node.uuid}:{node.password}@{node.server}:{node.port}?{query}"

        except Exception as e:
            print(f"V2Ray URI 转换错误 {node.protocol.value}: {e}")
            return None
        return None


class SubConv:
    """主转换类"""

    def __init__(self):
        self.parser = SubscriptionParser()
        self.nodes: list[Node] = []
        self.subscription_info = SubscriptionInfo()

    # 不同 UA 会让订阅后端返回不同格式，逐个尝试直到解析出节点
    USER_AGENTS = [
        'clash-verge/v1.3.6',
        'NekoBox/Android/1.2.9',
        'v2rayNG/1.8.0',
        'v2rayN/6.0',
        'sing-box/1.8.0',
        'ClashMeta/1.18.0',
        'Qv2ray/2.7.0',
    ]

    def load_from_url(self, url: str, quiet: bool = False) -> bool:
        """从 URL 加载订阅，自动尝试多个 User-Agent"""
        import urllib.request
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        last_err = None
        for ua in self.USER_AGENTS:
            try:
                req = urllib.request.Request(url, headers={'User-Agent': ua})
                with urllib.request.urlopen(req, timeout=20, context=ctx) as response:
                    content = response.read().decode('utf-8', errors='replace')
                    self._read_subscription_headers(response.headers)
                if self.load_from_content(content, quiet=True):
                    if not quiet:
                        print(f"使用 UA [{ua}] 加载成功")
                    return True
            except Exception as e:
                last_err = e
                continue

        print(f"加载 URL 失败: {last_err}")
        return False

    def _read_subscription_headers(self, headers) -> None:
        """Read common provider metadata headers without exposing credentials."""
        userinfo = headers.get('subscription-userinfo') or headers.get('Subscription-Userinfo')
        if userinfo:
            self.subscription_info = parse_subscription_userinfo(userinfo)
        title = headers.get('profile-title') or headers.get('Profile-Title')
        interval = headers.get('profile-update-interval') or headers.get('Profile-Update-Interval')
        if title:
            self.subscription_info.title = title
        if interval and str(interval).isdigit():
            self.subscription_info.update_interval = int(interval)

    def load_from_file(self, path: str, quiet: bool = False) -> bool:
        """从文件加载订阅"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                return self.load_from_content(content, quiet=quiet)
        except Exception as e:
            print(f"加载文件失败: {e}")
            return False

    def load_from_content(self, content: str, quiet: bool = False) -> bool:
        """从内容加载订阅"""
        content = content.strip()
        if not content:
            return False

        # 尝试解析不同格式
        nodes = []

        # 1. 尝试按行分割，直接解析 URI 列表（可能是 Base64 编码或原始 URI）
        lines = [line.strip() for line in content.split('\n') if line.strip()]
        uris = []

        # 检查是否是 Base64 编码的整体内容
        first_line = lines[0] if lines else ''
        if first_line and '://' not in first_line:
            # 可能是 Base64 编码的订阅
            decoded = self.parser.parse_base64_subscription(content)
            if decoded:
                uris = decoded
            else:
                # 尝试每行单独解析
                uris = lines
        else:
            # 已经是 URI 列表
            uris = lines

        if uris:
            for uri in uris:
                node = self.parser.parse_uri(uri)
                if node:
                    nodes.append(node)

        # 2. 如果没有解析出节点，尝试 Clash YAML
        if not nodes:
            clash_proxies = self.parser.parse_clash_yaml(content)
            for proxy in clash_proxies:
                node = self._clash_proxy_to_node(proxy)
                if node:
                    nodes.append(node)

        # 3. 尝试 SingBox JSON
        if not nodes:
            singbox_outbounds = self.parser.parse_singbox_json(content)
            for outbound in singbox_outbounds:
                node = self._singbox_outbound_to_node(outbound)
                if node:
                    nodes.append(node)

        if nodes:
            name_info, metadata_names = parse_name_metadata([n.name for n in nodes])
            header_info = self.subscription_info.source == 'Subscription-Userinfo'
            if not header_info and metadata_names:
                self.subscription_info = name_info
                nodes = [n for n in nodes if n.name not in metadata_names]
            self.nodes = nodes
            if not quiet:
                print(f"成功加载 {len(nodes)} 个节点")
            return bool(nodes)

        if not quiet:
            print("无法解析订阅内容")
        return False

    def _clash_proxy_to_node(self, proxy: dict) -> Optional[Node]:
        """将 Clash 代理配置转换为 Node"""
        try:
            proxy_type = proxy.get('type', '')
            name = proxy.get('name', 'Unknown')

            if proxy_type == 'vmess':
                return Node(
                    name=name,
                    protocol=Protocol.VMess,
                    server=proxy.get('server', ''),
                    port=proxy.get('port', 443),
                    uuid=proxy.get('uuid', ''),
                    method=proxy.get('cipher', 'auto'),
                    security='tls' if proxy.get('tls') else 'none',
                    network=proxy.get('network', 'tcp'),
                    path=proxy.get('ws-path', '/'),
                    host=proxy.get('ws-headers', {}).get('Host', ''),
                    sni=proxy.get('servername', ''),
                    skip_cert_verify=proxy.get('skip-cert-verify', False),
                    fingerprint=proxy.get('fingerprint', 'chrome'),
                    alpn=proxy.get('alpn'),
                )
            elif proxy_type == 'vless':
                return Node(
                    name=name,
                    protocol=Protocol.VLESS,
                    server=proxy.get('server', ''),
                    port=proxy.get('port', 443),
                    uuid=proxy.get('uuid', ''),
                    flow=proxy.get('flow', ''),
                    security='reality' if proxy.get('reality-opts') else ('tls' if proxy.get('tls') else 'none'),
                    network=proxy.get('network', 'tcp'),
                    sni=proxy.get('servername', ''),
                    allow_insecure=proxy.get('skip-cert-verify', False),
                    fingerprint=proxy.get('fingerprint', 'chrome'),
                    alpn=proxy.get('alpn'),
                    reality_opts=proxy.get('reality-opts'),
                )
            elif proxy_type == 'trojan':
                return Node(
                    name=name,
                    protocol=Protocol.Trojan,
                    server=proxy.get('server', ''),
                    port=proxy.get('port', 443),
                    password=proxy.get('password', ''),
                    network=proxy.get('network', 'tcp'),
                    sni=proxy.get('sni', ''),
                    allow_insecure=proxy.get('skip-cert-verify', False),
                    fingerprint=proxy.get('fingerprint', 'chrome'),
                    alpn=proxy.get('alpn'),
                )
            elif proxy_type == 'ss':
                return Node(
                    name=name,
                    protocol=Protocol.Shadowsocks,
                    server=proxy.get('server', ''),
                    port=proxy.get('port', 8388),
                    method=proxy.get('cipher', ''),
                    password=proxy.get('password', ''),
                    obfs=proxy.get('plugin', ''),
                )
            elif proxy_type == 'hysteria2':
                return Node(
                    name=name,
                    protocol=Protocol.Hysteria2,
                    server=proxy.get('server', ''),
                    port=proxy.get('port', 443),
                    password=proxy.get('password', ''),
                    sni=proxy.get('sni', ''),
                    allow_insecure=proxy.get('skip-cert-verify', False),
                    alpn=proxy.get('alpn', ['h3']),
                    obfs_type=proxy.get('obfs', ''),
                    obfs_password=proxy.get('obfs-password', ''),
                )
            elif proxy_type == 'tuic':
                return Node(
                    name=name,
                    protocol=Protocol.Tuic,
                    server=proxy.get('server', ''),
                    port=proxy.get('port', 443),
                    uuid=proxy.get('uuid', ''),
                    password=proxy.get('password', ''),
                    congestion_control=proxy.get('congestion-controller', 'bbr'),
                    udp_relay_mode=proxy.get('udp-relay-mode', 'native'),
                    allow_insecure=proxy.get('skip-cert-verify', False),
                    alpn=proxy.get('alpn', ['h3']),
                )
        except Exception as e:
            print(f"Clash 转 Node 失败: {e}")
            return None
        return None

    def _singbox_outbound_to_node(self, outbound: dict) -> Optional[Node]:
        """将 SingBox 出站配置转换为 Node"""
        try:
            out_type = outbound.get('type', '')
            name = outbound.get('tag', 'Unknown')
            if out_type in ('direct', 'block', 'dns', 'selector', 'urltest', 'mixed', 'shadowsocks_relay'):
                return None

            server = outbound.get('server', '')
            port = outbound.get('server_port', 443)
            tls = outbound.get('tls') or {}
            transport = outbound.get('transport') or {}
            network = transport.get('type', 'tcp')
            reality = tls.get('reality') or {}

            if out_type == 'vmess':
                return Node(name=name, protocol=Protocol.VMess, server=server, port=port,
                            uuid=outbound.get('uuid', ''), method=outbound.get('security', 'auto'),
                            security='tls' if tls.get('enabled') else 'none', network=network,
                            path=transport.get('path', '/'),
                            host=(transport.get('headers') or {}).get('Host', ''),
                            sni=tls.get('server_name', ''),
                            allow_insecure=tls.get('insecure', False),
                            fingerprint=(tls.get('utls') or {}).get('fingerprint', 'chrome'),
                            alpn=tls.get('alpn'))
            elif out_type == 'vless':
                return Node(name=name, protocol=Protocol.VLESS, server=server, port=port,
                            uuid=outbound.get('uuid', ''), flow=outbound.get('flow', ''),
                            security='reality' if reality.get('enabled') else ('tls' if tls.get('enabled') else 'none'),
                            network=network, path=transport.get('path', '/'),
                            host=(transport.get('headers') or {}).get('Host', ''),
                            sni=tls.get('server_name', ''),
                            allow_insecure=tls.get('insecure', False),
                            fingerprint=(tls.get('utls') or {}).get('fingerprint', 'chrome'),
                            alpn=tls.get('alpn'),
                            reality_opts={'public_key': reality.get('public_key', ''),
                                          'short_id': reality.get('short_id', '')} if reality.get('enabled') else None,
                            grpc_service_name=transport.get('service_name'))
            elif out_type == 'trojan':
                return Node(name=name, protocol=Protocol.Trojan, server=server, port=port,
                            password=outbound.get('password', ''), network=network,
                            path=transport.get('path', '/'),
                            host=(transport.get('headers') or {}).get('Host', ''),
                            sni=tls.get('server_name', ''),
                            allow_insecure=tls.get('insecure', False),
                            fingerprint=(tls.get('utls') or {}).get('fingerprint', 'chrome'),
                            alpn=tls.get('alpn'),
                            grpc_service_name=transport.get('service_name'))
            elif out_type == 'shadowsocks':
                return Node(name=name, protocol=Protocol.Shadowsocks, server=server, port=port,
                            method=outbound.get('method', 'chacha20-ietf-poly1305'),
                            password=outbound.get('password', ''))
            elif out_type in ('hysteria2', 'tuic'):
                if out_type == 'hysteria2':
                    obfs = outbound.get('obfs') or {}
                    return Node(name=name, protocol=Protocol.Hysteria2, server=server, port=port,
                                password=outbound.get('password', ''), sni=tls.get('server_name', server),
                                alpn=tls.get('alpn') or ['h3'], allow_insecure=tls.get('insecure', False),
                                obfs_type=obfs.get('type'), obfs_password=obfs.get('password'))
                return Node(name=name, protocol=Protocol.Tuic, server=server, port=port,
                            uuid=outbound.get('uuid', ''), password=outbound.get('password', ''),
                            congestion_control=outbound.get('congestion_control', 'bbr'),
                            udp_relay_mode=outbound.get('udp_relay_mode', 'native'),
                            alpn=tls.get('alpn') or ['h3'], allow_insecure=tls.get('insecure', False),
                            sni=tls.get('server_name', server))
            elif out_type == 'wireguard':
                return Node(name=name, protocol=Protocol.WireGuard, server=server, port=port,
                            private_key=outbound.get('private_key', ''),
                            peer_public_key=outbound.get('peer_public_key', ''),
                            pre_shared_key=outbound.get('pre_shared_key', ''),
                            local_address=outbound.get('local_address'),
                            mtu=outbound.get('mtu', 1420), reserved=outbound.get('reserved'))
        except Exception as e:
            print(f"SingBox 转 Node 失败: {e}")
            return None
        return None

    def print_subscription_info(self) -> None:
        """Print subscription metadata and parse status."""
        info = self.subscription_info
        print(f"节点数量: {len(self.nodes)}")
        if info.upload or info.download or info.total or info.expire:
            print(f"上传: {format_bytes(info.upload)}")
            print(f"下载: {format_bytes(info.download)}")
            print(f"已用: {format_bytes(info.used)}")
            print(f"总量: {format_bytes(info.total)}")
            print(f"剩余: {format_bytes(info.remaining)}")
            print(f"到期: {datetime.fromtimestamp(info.expire).astimezone().strftime('%Y-%m-%d %H:%M:%S') if info.expire else '未知'}")
        else:
            print("订阅响应未提供 Subscription-Userinfo 流量/到期信息")

    def export_metadata(self, output_path: str) -> bool:
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(self.subscription_info.to_dict() | {'node_count': len(self.nodes)}, f, indent=2, ensure_ascii=False)
            print(f"订阅元数据已保存到: {output_path}")
            return True
        except Exception as e:
            print(f"导出元数据失败: {e}")
            return False

    def export_clash(self, output_path: str, config_template: Optional[dict] = None) -> bool:
        """导出为 Clash 配置"""
        try:
            config = clean_nulls(ClashConverter.convert(self.nodes, config_template))
            info = self.subscription_info
            comments = ["# SubConv subscription metadata"]
            if info.upload or info.download or info.total or info.expire:
                comments.append(f"# Subscription-Userinfo: upload={info.upload}; download={info.download}; total={info.total}; expire={info.expire or 0}")
                comments.append(f"# Used: {format_bytes(info.used)} / {format_bytes(info.total)}; Remaining: {format_bytes(info.remaining)}")
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(comments) + '\n')
                yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
            print(f"Clash 配置已保存到: {output_path}")
            return True
        except Exception as e:
            print(f"导出 Clash 失败: {e}")
            return False

    def export_singbox(self, output_path: str) -> bool:
        """导出为 SingBox 配置"""
        try:
            config = clean_nulls(SingBoxConverter.convert(self.nodes))
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            print(f"SingBox 配置已保存到: {output_path}")
            return True
        except Exception as e:
            print(f"导出 SingBox 失败: {e}")
            return False

    def export_v2ray(self, output_path: str) -> bool:
        """导出为 V2Ray URI (Base64)"""
        try:
            content = V2RayConverter.convert(self.nodes)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"V2Ray 订阅已保存到：{output_path}")
            return True
        except Exception as e:
            print(f"导出 V2Ray 失败: {e}")
            return False

    def list_nodes(self):
        """列出所有节点"""
        print(f"\n共 {len(self.nodes)} 个节点:")
        for i, node in enumerate(self.nodes, 1):
            print(f"{i}. [{node.protocol.value}] {node.name} - {node.server}:{node.port}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='订阅转换工具 - SubConv')
    parser.add_argument('-i', '--input', required=True, help='输入订阅 URL 或文件路径')
    parser.add_argument('-o', '--output', help='输出文件路径')
    parser.add_argument('-t', '--target', choices=['clash', 'singbox', 'v2ray'], default='clash',
                        help='目标格式 (默认：clash)')
    parser.add_argument('-l', '--list', action='store_true', help='仅列出节点，不转换')
    parser.add_argument('--check', action='store_true', help='检测订阅、节点数量及流量/到期信息')
    parser.add_argument('--json', action='store_true', help='与 --check 一起输出 JSON')
    parser.add_argument('--metadata-output', help='额外保存订阅元数据 JSON 文件')

    args = parser.parse_args()

    converter = SubConv()

    # 加载订阅
    if args.input.startswith('http://') or args.input.startswith('https://'):
        loaded = converter.load_from_url(args.input, quiet=args.json)
    else:
        loaded = converter.load_from_file(args.input, quiet=args.json)

    if args.check:
        result = converter.subscription_info.to_dict()
        result.update({'ok': bool(loaded and converter.nodes), 'node_count': len(converter.nodes), 'input': args.input})
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            converter.print_subscription_info()
        return 0 if result['ok'] else 1

    if not loaded:
        return 1

    if args.list:
        converter.list_nodes()
        return

    if not args.output:
        print("错误：-o/--output 是必需的（除非使用 -l 模式）")
        return

    # 转换
    if args.target == 'clash':
        converter.export_clash(args.output)
    elif args.target == 'singbox':
        converter.export_singbox(args.output)
    elif args.target == 'v2ray':
        converter.export_v2ray(args.output)

    if args.metadata_output:
        converter.export_metadata(args.metadata_output)
    print("\n转换完成!")


if __name__ == '__main__':
    raise SystemExit(main() or 0)
