/* ================= Node → URI ================= */
function node2uri(n){
  const q=(o)=>obj2qs(clean(o));
  const name=encodeURIComponent(n.name||'');
  try{
    if(n.protocol==='vmess'){
      const d={v:'2', ps:n.name||'VMess', add:n.server, port:String(n.port), id:n.uuid,
        aid:String(n.alterId||0), scy:n.cipher||'auto', net:n.network||'tcp', type:n.type||'none',
        host:n.host||'', path:n.path||'', tls:n.security==='tls'?'tls':(n.security==='reality'?'reality':'')};
      if(n.sni&&n.sni!==n.host) d.sni=n.sni;
      if(n.alpn&&n.alpn.length) d.alpn=n.alpn.join(',');
      if(n.fingerprint) d.fp=n.fingerprint;
      if(n.network==='grpc'&&n.grpcServiceName) d.serviceName=n.grpcServiceName;
      if(n.reality){ d.pbk=n.reality.public_key; d.sid=n.reality.short_id; if(n.reality.spx) d.spx=n.reality.spx; }
      if(n.insecure) d.allowInsecure='1';
      return 'vmess://'+b64e(JSON.stringify(d));
    }
    if(n.protocol==='vless'){
      const o={encryption:n.encryption||'none', type:n.network||'tcp', security:n.security||'none'};
      if(n.flow) o.flow=n.flow;
      if(n.network==='ws'){ if(n.path) o.path=n.path; if(n.host) o.host=n.host; }
      if(n.network==='grpc'&&n.grpcServiceName) o.serviceName=n.grpcServiceName;
      if(n.network==='h2'){ if(n.host) o.host=n.host; if(n.path) o.path=n.path; }
      if(n.security==='tls'||n.security==='reality'){
        if(n.sni) o.sni=n.sni;
        if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
        if(n.fingerprint) o.fp=n.fingerprint;
      }
      if(n.security==='reality'&&n.reality){
        o.pbk=n.reality.public_key; if(n.reality.short_id) o.sid=n.reality.short_id;
        if(n.reality.spx&&n.reality.spx!=='/') o.spx=n.reality.spx;
      }
      if(n.insecure) o.allowInsecure='1';
      if(n.udp===false) o.udp='false';
      return `vless://${n.uuid}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='trojan'){
      const o={};
      if(n.security==='tls'||n.security!=='none'){
        if(n.sni) o.sni=n.sni; else if(n.peer) o.peer=n.peer;
        if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
        if(n.fingerprint) o.fp=n.fingerprint;
        if(n.security==='reality') o.security='reality';
      }
      if(n.network&&n.network!=='tcp') o.type=n.network;
      if(n.network==='ws'&&n.path) o.path=n.path;
      if(n.network==='grpc'&&n.grpcServiceName) o.serviceName=n.grpcServiceName;
      if(n.insecure) o.allowInsecure='1';
      if(n.reality&&n.security==='reality'){ o.pbk=n.reality.public_key; if(n.reality.short_id)o.sid=n.reality.short_id; }
      return `trojan://${encodeURIComponent(n.password||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='ss'){
      const method=n.method||n.cipher||'chacha20-ietf-poly1305';
      const o={};
      if(n.plugin){ o.plugin=n.plugin + (n.obfsParams?('%3A'+encodeURIComponent(n.obfsParams)):''); }
      return `ss://${b64e(method+':'+(n.password||''))}@${addr(n.server)}:${n.port}${q(o)?('?'+q(o)):''}#${name}`;
    }
    if(n.protocol==='ssr'){
      const main=b64e(`${n.server}:${n.port}:${n.protocolParam||'origin'}:${n.method||'aes-256-cfb'}:${n.obfsType||'plain'}:${encodeURIComponent(n.server)}:${encodeURIComponent(n.password||'')}`)
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      return `ssr://${main}/?${q({proto_param:encodeURIComponent(n.protocolParam||''), obfsparam:encodeURIComponent(n.obfsPassword||'')})}#${name}`;
    }
    if(n.protocol==='hysteria2'){
      const o={};
      if(n.sni) o.sni=n.sni;
      if(n.insecure) o.insecure='1';
      if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
      if(n.obfsType){ o.obfs=n.obfsType; if(n.obfsPassword) o['obfs-password']=n.obfsPassword; }
      if(n.disableMTUDiscovery) o.mtu='1400';
      if(n.down) o.downmbps=n.down; if(n.up) o.upmbps=n.up;
      return `hy2://${encodeURIComponent(n.password||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='tuic'){
      const o={};
      if(n.sni) o.sni=n.sni;
      if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
      o.congestion_control=n.congestionControl||'cubic';
      o.udp_relay_mode=n.udpRelayMode||'native';
      if(n.insecure) o.allow_insecure='1';
      return `tuic://${encodeURIComponent(n.uuid||'')}:${encodeURIComponent(n.password||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='wireguard'){
      const o={ publickey:n.peerPublicKey||'', address:(n.localAddress||[]).join(','),
        mtu:n.mtu||1420, keepalive:n.persistentKeepalive||0 };
      if(n.preSharedKey) o.preshared_key=n.preSharedKey;
      if(n.reserved&&n.reserved.length) o.reserved=n.reserved.join(',');
      return `wg://${encodeURIComponent(n.privateKey||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='anytls'){
      const o={ sni:n.sni||n.server };
      if(n.alpn&&n.alpn.length) o.alpn=n.alpn.join(',');
      if(n.insecure) o.allowinsecure='1';
      if(n.fingerprint) o.fp=n.fingerprint;
      return `anytls://${encodeURIComponent(n.password||'')}@${addr(n.server)}:${n.port}?${q(o)}#${name}`;
    }
    if(n.protocol==='socks5'){
      const u=(n.username||n.password)?encodeURIComponent(n.username||'')+':'+encodeURIComponent(n.password||'')+'@':'';
      return `socks5://${u}${addr(n.server)}:${n.port}#${name}`;
    }
    if(n.protocol==='http'){
      const u=(n.username||n.password)?encodeURIComponent(n.username||'')+':'+encodeURIComponent(n.password||'')+'@':'';
      return `http://${u}${addr(n.server)}:${n.port}#${name}`;
    }
  }catch(e){ console.warn('uri gen fail',n,e); }
  return null;
}
function addr(s){ s=String(s||''); return /^[0-9a-fA-F:]*:[0-9a-fA-F:]+$/.test(s)&&s.includes(':')&&!/^\d+$/.test(s)?('['+s+']'):s; }

/* ================= Node → Clash dict ================= */
function node2clash(n){
  const o={ name:n.name, type:n.protocol, server:n.server, port:n.port };
  if(n.ip) o.ip=n.ip;
  const set=(k,v)=>{ if(v!==undefined&&v!==null&&v!=='') o[k]=v; };
  switch(n.protocol){
    case 'vmess':
      set('uuid',n.uuid); set('alterId',n.alterId||0); set('cipher',n.cipher||'auto');
      set('tls',n.security==='tls'||n.security==='reality'?true:undefined);
      set('servername',n.sni); set('client-fingerprint',n.fingerprint);
      set('skip-cert-verify',n.insecure?true:undefined);
      break;
    case 'vless':
      set('uuid',n.uuid); set('flow',n.flow); set('tls',n.security!=='none'?true:undefined);
      set('servername',n.sni); set('client-fingerprint',n.fingerprint);
      set('reality-opts',n.reality?{'public-key':n.reality.public_key,'short-id':n.reality.short_id}:undefined);
      set('skip-cert-verify',n.insecure?true:undefined); set('udp',n.udp!==false?true:undefined);
      break;
    case 'trojan':
      set('password',n.password); set('tls',n.security!=='none'?true:undefined);
      set('servername',n.sni); set('client-fingerprint',n.fingerprint);
      set('reality-opts',n.reality?{'public-key':n.reality.public_key,'short-id':n.reality.short_id}:undefined);
      set('skip-cert-verify',n.insecure?true:undefined);
      break;
    case 'ss':
      set('cipher',n.method||n.cipher||'chacha20-ietf-poly1305'); set('password',n.password);
      set('udp',true);
      if(n.plugin){ set('plugin',n.plugin);
        try{ const po=n.obfsParams?qs2obj(n.obfsParams.replace(/;/g,'&')):{};
          if(Object.keys(po).length) o['plugin-opts']=po; }catch(e){} }
      break;
    case 'hysteria2':
      set('password',n.password); set('sni',n.sni||undefined);
      set('skip-cert-verify',n.insecure?true:undefined); set('alpn',n.alpn&&n.alpn.length?n.alpn:['h3']);
      set('obfs',n.obfsType); set('obfs-password',n.obfsPassword);
      set('disable-mtu-discovery',n.disableMTUDiscovery?true:undefined);
      set('down',n.down); set('up',n.up);
      break;
    case 'tuic':
      set('uuid',n.uuid); set('password',n.password);
      set('congestion-controller',n.congestionControl||'cubic');
      set('udp-relay-mode',n.udpRelayMode||'native');
      set('sni',n.sni||undefined); set('alpn',n.alpn&&n.alpn.length?n.alpn:['h3']);
      set('skip-cert-verify',n.insecure?true:undefined);
      break;
    case 'wireguard':
      set('private-key',n.privateKey); set('public-key',n.peerPublicKey);
      set('pre-shared-key',n.preSharedKey);
      set('ip',(n.localAddress||[])[0]); set('mtu',n.mtu||1420);
      set('reserved',n.reserved&&n.reserved.length?n.reserved.join(', '):undefined);
      set('udp',true); o.type='wireguard';
      break;
    case 'anytls':
      set('password',n.password); set('sni',n.sni);
      set('skip-cert-verify',n.insecure?true:undefined);
      set('alpn',n.alpn); set('client-fingerprint',n.fingerprint);
      break;
    case 'socks5': set('username',n.username); set('password',n.password); break;
    case 'http': set('username',n.username); set('password',n.password); break;
  }
  // 传输层
  const net=(n.network||'tcp').toLowerCase();
  if(net!=='tcp'&&n.protocol!=='hysteria2'&&n.protocol!=='tuic'&&n.protocol!=='wireguard'){
    o.network=net==='h2'?'h2':net==='http'?'h2':net;
    if(net==='ws'){ const w={}; if(n.path) w.path=n.path;
      if(n.host) w.headers={Host:n.host}; if(Object.keys(w).length) o['ws-opts']=w; }
    else if(net==='grpc'){ const g={}; if(n.grpcServiceName) g['grpc-service-name']=n.grpcServiceName;
      if(Object.keys(g).length) o['grpc-opts']=g; o.udp=o.udp===undefined?true:o.udp; }
    else if(net==='h2'||net==='http'){ const h={}; if(n.path) h.path=n.path;
      if(n.host) h.headers={Host:n.host}; if(o.servername) h.host=[o.servername];
      if(Object.keys(h).length) o['h2-opts']=h; }
  }
  if(n.alpn&&n.alpn.length&&!['hysteria2','tuic'].includes(n.protocol)) o.alpn=n.alpn;
  return clean(o);
}
/* ================= Node → sing-box dict ================= */
function node2sing(n){
  const o={ type:n.protocol==='ss'?'shadowsocks':(n.protocol==='socks5'?'socks':n.protocol),
    tag:n.name, server:n.server, server_port:n.port };
  const set=(k,v)=>{ if(v!==undefined&&v!==null&&v!==''&&!(Array.isArray(v)&&!v.length)) o[k]=v; };
  const net=(n.network||'tcp').toLowerCase();
  const useTls=n.security==='tls'||n.security==='reality';
  switch(n.protocol){
    case 'vmess': set('uuid',n.uuid); set('alter_id',n.alterId||0); set('security',n.cipher||'auto');
      set('global_padding',undefined); break;
    case 'vless': set('uuid',n.uuid); set('flow',n.flow); set('packet_encoding',n.flow?'xudp':''); break;
    case 'trojan': set('password',n.password); break;
    case 'ss': set('method',n.method||n.cipher||'chacha20-ietf-poly1305'); set('password',n.password); break;
    case 'hysteria2': set('password',n.password);
      set('obfs',n.obfsType?{type:n.obfsType,password:n.obfsPassword||''}:undefined);
      if(n.down) set('down_mbps',+n.down); if(n.up) set('up_mbps',+n.up);
      break;
    case 'tuic': set('uuid',n.uuid); set('password',n.password);
      set('congestion_control',n.congestionControl||'cubic'); set('udp_relay_mode',n.udpRelayMode||'native'); break;
    case 'wireguard': set('private_key',n.privateKey); set('peer_public_key',n.peerPublicKey);
      set('pre_shared_key',n.preSharedKey); set('local_address',n.localAddress); set('mtu',n.mtu||1420);
      set('reserved',n.reserved); break;
    case 'anytls': set('password',n.password); break;
    case 'socks5': set('version','5'); set('username',n.username); set('password',n.password); break;
    case 'http': set('username',n.username); set('password',n.password); break;
  }
  if(useTls||['hysteria2','tuic'].includes(n.protocol)){
    const t={enabled:true};
    if(n.sni) t.server_name=n.sni;
    if(n.insecure) t.insecure=true;
    if(n.alpn&&n.alpn.length) t.alpn=n.alpn;
    if(n.fingerprint&&['vmess','vless','trojan','anytls'].includes(n.protocol))
      t.utls={enabled:true, fingerprint:n.fingerprint};
    if(n.security==='reality'&&n.reality)
      t.reality={enabled:true, public_key:n.reality.public_key, short_id:n.reality.short_id};
    o.tls=t;
  }
  if(!['hysteria2','tuic','wireguard'].includes(n.protocol)&&net!=='tcp'){
    const tr={type:net==='http'?'h2':net};
    if(net==='ws'){ if(n.path) tr.path=n.path; if(n.host) tr.headers={Host:n.host}; }
    if(net==='grpc'&&n.grpcServiceName) tr.service_name=n.grpcServiceName;
    if(net==='h2'){ if(n.path) tr.path=n.path; if(n.host) tr.host=[n.host]; }
    o.transport=tr;
  }
  return clean(o);
}
