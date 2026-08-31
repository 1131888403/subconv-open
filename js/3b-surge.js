/* ================= Surge CONF → Node ================= */
function surgeSections(text){
  const res={}; let cur=null;
  String(text).split(/\r?\n/).forEach(l=>{
    const m=/^\[(.+?)\]/.exec(l.trim());
    if(m){ cur=m[1].trim(); res[cur]=res[cur]||[]; return; }
    if(cur!==null&&l.trim()) res[cur].push(l);
  });
  return res;
}
function baseNode(proto,name,server,port){
  return {protocol:proto, name:name, server:String(server||''), port:+port||443,
    uuid:'', password:'', alterId:0, cipher:'', method:'', network:'tcp', security:'none',
    sni:'', host:'', path:'', alpn:null, fingerprint:'', insecure:false, flow:'', reality:null,
    obfsType:'', obfsPassword:'', grpcServiceName:'', plugin:'', udp:true, raw:null};
}
function surgeLine(l){
  const s=trimStr(l);
  if(!s||/^[;#]/.test(s)||s[0]==='[') return null;
  const i=s.indexOf('='); if(i<0) return null;
  const name=s.slice(0,i).trim().replace(/^"|"$/g,'');
  let parts=splitComma(s.slice(i+1));
  let type=(parts[0]||'').trim().toLowerCase();
  let server=parts[1], port=parts[2];
  // Surge: NAME = external, host, port, <realtype>, key=value...
  if(type==='external'){ type=(parts[3]||'').trim().toLowerCase(); parts=parts.slice(0,3).concat(parts.slice(4)); }
  const kv={};
  parts.slice(3).forEach(x=>{ const j=x.indexOf('=');
    if(j>0) kv[x.slice(0,j).trim().toLowerCase()]=x.slice(j+1).trim().replace(/^"|"$/g,''); });
  const bool=v=>v==='true'||v==='1'||v==='yes';
  try{
    if(type==='vmess'&&server){
      const n=baseNode('vmess',name,server,port||443);
      n.uuid=kv.username||kv.password||''; n.alterId=+kv['alter-id']||0;
      n.cipher=kv['vmess-mode']||'auto';
      if(bool(kv.tls)||bool(kv['over-tls'])){ n.security='tls'; n.sni=kv.sni||kv['obfs-host']||server; }
      if(bool(kv.ws)||type==='ws'){ n.network='ws'; n.path=kv['ws-path']||'/'; n.host=kv['ws-host']||kv['obfs-host']||''; }
      if(!n.name) n.name='VMess';
      return n;
    }
    if(type==='vless'&&server){
      const n=baseNode('vless',name,server,port||443);
      n.uuid=kv.username||'';
      if(bool(kv['reality'])) n.security='reality'; else if(bool(kv.tls)) n.security='tls';
      n.sni=kv.sni||kv['tls-hosting']||kv['tls-host']||server;
      if(n.security==='reality') n.reality={public_key:kv['reality-public-key']||'', short_id:String(kv['reality-short-id']||''), spx:''};
      n.flow=kv['flow']||'';
      if(bool(kv.ws)){ n.network='ws'; n.path=kv['ws-path']||'/'; n.host=kv['ws-host']||''; }
      if(bool(kv['tcp-obsolete-header'])) n.network='tcp';
      return n;
    }
    if(type==='trojan'&&server){
      const n=baseNode('trojan',name,server,port||443);
      n.password=kv.password||''; n.security='tls';
      n.sni=kv.sni||kv['tls-host']||server; n.alpn=kv.alpn?String(kv.alpn).split(','):['http/1.1'];
      if(bool(kv['tls-pinning'])||bool(kv['skip-cert-verify'])||kv['tls-verification']==='skip') n.insecure=true;
      if(bool(kv.ws)){ n.network='ws'; n.path=kv['ws-path']||'/'; n.host=kv['ws-host']||''; }
      if(bool(kv['reality'])){ n.security='reality'; n.reality={public_key:kv['reality-public-key']||'', short_id:String(kv['reality-short-id']||''), spx:''}; }
      return n;
    }
    if((type==='ss'||type==='shadowsocks'||type==='custom')&&server){
      const n=baseNode('ss',name,server,port||8388);
      n.method=kv['encrypt-method']||'aes-256-gcm'; n.password=kv.password||'';
      if(kv.obfs&&kv.obfs!=='plain'){ n.plugin=kv.obfs; n.obfsParams='mode='+(kv['obfs-mode']||'')+(kv['obfs-host']?';host='+kv['obfs-host']:''); }
      n.udp=bool(kv['udp-relay'])||kv['udp-relay']===undefined;
      return n;
    }
    if(type==='ssr'&&server){
      const n=baseNode('ssr',name,server,port||8388);
      n.method=kv.method||'aes-256-cfb'; n.password=kv.password||'';
      n.protocolParam=kv.protocol||'origin'; n.obfsType=kv.obfs||'plain'; n.obfsPassword=kv['obfs-param']||'';
      return n;
    }
    if((type==='hysteria2'||type==='hysteria'||type==='hy2')&&server){
      const n=baseNode('hysteria2',name,server,port||443);
      n.password=kv.password||''; n.security='tls'; n.sni=kv.sni||server;
      n.alpn=['h3']; n.insecure=bool(kv['skip-cert-verify']);
      if(kv.obfs&&kv.obfs!=='none') n.obfsType=kv.obfs;
      n.obfsPassword=kv['obfs-param']||'';
      return n;
    }
    if(type==='tuic'&&server){
      const n=baseNode('tuic',name,server,port||443);
      n.uuid=kv.token||kv.password||''; n.password=kv.password||'';
      n.security='tls'; n.sni=kv.sni||server; n.alpn=kv.alpn?String(kv.alpn).split(','):['h3'];
      n.congestionControl=kv['congestion-controller']||'cubic';
      n.udpRelayMode=kv['udp-relay-mode']||'native';
      n.insecure=bool(kv['skip-cert-verify']);
      return n;
    }
    if(type==='wireguard'&&server){
      const n=baseNode('wireguard',name,server,port||51820);
      n.peerPublicKey=kv['public-key']||''; n.privateKey=kv['private-key']||'';
      n.preSharedKey=kv['pre-shared-key']||'';
      n.localAddress=(kv.ip?String(kv.ip).split(','):[]).map(x=>x.includes('/')?x:x+'/32');
      n.mtu=+kv.mtu||1428;
      return n;
    }
    if((type==='any-tls'||type==='anytls')&&server){
      const n=baseNode('anytls',name,server,port||443);
      n.password=kv.password||''; n.security='tls'; n.sni=kv.sni||server;
      n.alpn=kv.alpn?String(kv.alpn).split(','):['h2','http/1.1'];
      n.insecure=bool(kv['skip-cert-verify']);
      return n;
    }
    if((type==='socks5'||type==='socks5-tls'||type==='http'||type==='https')&&server){
      const isHttp=type==='http'||type==='https';
      const n=baseNode(isHttp?'http':'socks5',name,server,port||(isHttp?80:1080));
      n.username=kv.username||''; n.password=kv.password||'';
      if(type==='socks5-tls'||type==='https'){ n.security='tls'; n.sni=kv.sni||server; }
      return n;
    }
  }catch(e){ console.warn('surge line fail:',l,e); }
  return null;
}
