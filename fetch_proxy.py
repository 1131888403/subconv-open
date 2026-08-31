#!/usr/bin/env python3
"""Personal subscription fetch and relay service.

The browser calls /fetch or /create with its server-side token injected by Nginx.
/create stores an allowlisted upstream URL + selected UA, returns an opaque relay ID.
/sub/<id> is a client-facing subscription link; its ID is a bearer secret.
"""
import argparse
import json
import os
import secrets
import ipaddress
import socket
import ssl
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

USER_AGENTS = {'clash-verge/v1.3.6','NekoBox/Android/1.2.9','v2rayNG/1.8.0','v2rayN/6.0','sing-box/1.8.0','ClashMeta/1.18.0','Qv2ray/2.7.0'}
MAX_BYTES = 8 * 1024 * 1024

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, 'redirects disabled for safety', headers, fp)

class App(BaseHTTPRequestHandler):
    token=''; store_path='/var/lib/subconv-fetch/relays.json'
    def public_url(self, raw):
        try:
            u=urllib.parse.urlsplit(raw); host=u.hostname
            if u.scheme not in ('http','https') or not host or u.username or u.password: return False
            if u.port not in (None,80,443): return False
            # Reject literal private/reserved/link-local targets.
            try: ips=[ipaddress.ip_address(host)]
            except ValueError:
                try: ips=[ipaddress.ip_address(x[4][0]) for x in socket.getaddrinfo(host,None,type=socket.SOCK_STREAM)]
                except socket.gaierror: return False
            return all(ip.is_global for ip in ips)
        except (ValueError,UnicodeError): return False
    def log_message(self, fmt, *args): print('%s - %s' % (self.address_string(), fmt % args))
    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin','*'); self.send_header('Access-Control-Allow-Methods','GET, OPTIONS')
    def error_json(self, code, message):
        self.send_response(code); self.send_cors(); self.send_header('Content-Type','application/json; charset=utf-8'); self.end_headers()
        self.wfile.write(json.dumps({'error':message},ensure_ascii=False).encode())
    def valid_url(self, raw):
        return self.public_url(raw)
    @classmethod
    def load_store(cls):
        try:
            with open(cls.store_path,encoding='utf8') as f: return json.load(f)
        except (FileNotFoundError,json.JSONDecodeError): return {}
    @classmethod
    def save_store(cls, data):
        parent=os.path.dirname(cls.store_path); os.makedirs(parent,mode=0o700,exist_ok=True)
        fd,tmp=tempfile.mkstemp(dir=parent,prefix='.relays-',text=True)
        with os.fdopen(fd,'w',encoding='utf8') as f: json.dump(data,f,separators=(',',':')); f.flush(); os.fsync(f.fileno())
        os.chmod(tmp,0o600); os.replace(tmp,cls.store_path)
    def upstream(self, raw, ua):
        req=urllib.request.Request(raw,headers={'User-Agent':ua,'Accept':'*/*'})
        ctx=ssl.create_default_context()
        opener=urllib.request.build_opener(NoRedirect,urllib.request.HTTPSHandler(context=ctx))
        with opener.open(req,timeout=25) as res:
            data=res.read(MAX_BYTES+1)
            if len(data)>MAX_BYTES: raise ValueError('response exceeds 8MB')
            return data,res.headers.get('Content-Type','text/plain; charset=utf-8'),res.headers.get('Subscription-Userinfo'),res.headers.get('Profile-Title')
    def serve_upstream(self, raw, ua, relay=False):
        try:
            data,ctype,userinfo,title=self.upstream(raw,ua)
            self.send_response(200)
            if not relay: self.send_cors()
            self.send_header('Content-Type',ctype); self.send_header('Cache-Control','no-store')
            if userinfo: self.send_header('Subscription-Userinfo',userinfo)
            if title: self.send_header('Profile-Title',title)
            self.end_headers(); self.wfile.write(data)
        except urllib.error.HTTPError as e: self.error_json(e.code,'upstream HTTP %s'%e.code)
        except ValueError as e: self.error_json(413,str(e))
        except Exception as e: self.error_json(502,'upstream request failed: '+type(e).__name__)
    def do_OPTIONS(self): self.send_response(204); self.send_cors(); self.end_headers()
    def do_GET(self):
        p=urllib.parse.urlsplit(self.path); q=urllib.parse.parse_qs(p.query)
        if p.path=='/health':
            self.send_response(200); self.send_cors(); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(b'{"ok":true}'); return
        if p.path.startswith('/sub/'):
            rid=p.path[5:]
            if not rid or '/' in rid: self.error_json(404,'relay not found'); return
            rec=self.load_store().get(rid)
            if not rec: self.error_json(404,'relay not found'); return
            self.serve_upstream(rec['url'],rec['ua'],relay=True); return
        if p.path not in ('/fetch','/create'): self.error_json(404,'use /fetch, /create, or /sub/<id>'); return
        if not self.token or q.get('token',[''])[0]!=self.token: self.error_json(401,'invalid token'); return
        raw=q.get('url',[''])[0]; ua=q.get('ua',['clash-verge/v1.3.6'])[0]
        if not self.valid_url(raw): self.error_json(403,'invalid or non-allowlisted subscription URL'); return
        if ua not in USER_AGENTS: ua='clash-verge/v1.3.6'
        if p.path=='/fetch': self.serve_upstream(raw,ua); return
        store=self.load_store(); rid=secrets.token_urlsafe(32); store[rid]={'url':raw,'ua':ua,'created':int(time.time())}; self.save_store(store)
        self.send_response(201); self.send_cors(); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(json.dumps({'id':rid}).encode())

def main():
    a=argparse.ArgumentParser(); a.add_argument('--host',default='127.0.0.1'); a.add_argument('--port',type=int,default=8787); x=a.parse_args()
    token=os.environ.get('SUBCONV_PROXY_TOKEN','')
    if not token: a.error('set SUBCONV_PROXY_TOKEN')
    App.token=token
    print('Listening on http://%s:%s; public HTTP(S) upstreams enabled with SSRF protection'%(x.host,x.port))
    ThreadingHTTPServer((x.host,x.port),App).serve_forever()
if __name__=='__main__': main()
