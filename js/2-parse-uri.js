/* ================= URI → Node ================= */
function fragName(f){
  if(!f) return '';
  let s=String(f).split('?')[0].split('&')[0];
  try{ s=decodeURIComponent(s.replace(/\+/g,' ')); }catch(e){}
  return s.trim();
}
function parseURI(uri){
  uri=trimStr(uri);
  const m=/^([a-zA-Z0-9+.-]+):\/\/(.*)$/.exec(uri);
  if(!m) return null;
  const scheme=m[1].toLowerCase();
  let rest=m[2], frag='', query='';
  const hi=rest.indexOf('#');
  if(hi>=0){ frag=rest.slice(hi+1); rest=rest.slice(0,hi); }
  const qi=rest.indexOf('?');
  if(qi>=0){ query=rest.slice(qi+1); rest=rest.slice(0,qi); }
  const p=qs2obj(query);
  const name=fragName(frag)||fragName(p.remarks)||fragName(p.name)||fragName(p.ps)||fragName(p.tag)||'';
  const at=rest.lastIndexOf('@');
  const credStr=at>=0?rest.slice(0,at):'';
  const [server,port]=splitHostPort(at>=0?rest.slice(at+1):rest,443);
  const arr=v=>Array.isArray(v)?v:(v?String(v).split(','):null);
  const n={protocol:scheme, name:name||scheme.toUpperCase(), server, port,
    uuid:'', password:'', alterId:0, cipher:'', network:'tcp', security:'none',
    sni:'', host:'', path:'', alpn:null, fingerprint:'', insecure:false,
    flow:'', reality:null, obfsType:'', obfsPassword:'', grpcServiceName:'',
    plugin:'', method:'', raw:uri};

  try{
    if(scheme==='vmess'){
      const d=JSON.parse(b64d(rest));
      if(!d||!d.add) return null;
      return Object.assign(n,{
        protocol:'vmess', name:name||d.ps||d.name||'VMess',
        server:d.add, port:+d.port||443, uuid:d.id||'', alterId:+d.aid||0,
        cipher:d.scy||'auto', security:d.tls||'none', network:d.net||'tcp',
        sni:d.sni||d.host||'', host:d.host||'', path:d.path||'',
        alpn:arr(d.alpn), fingerprint:d.fp||'',
        insecure:+(d.allowInsecure||0)===1,
        reality:d.pbk?{public_key:d.pbk, short_id:String(d.sid||''), spx:d.spx||''}:null,
        grpcServiceName:d.serviceName||''});
    }
    if(scheme==='vless'){
      const sec=p.security||'none';
      n.protocol='vless'; n.name=name||'VLESS';
      n.uuid=credStr; n.network=p.type||'tcp'; n.security=sec;
      n.flow=p.flow||''; n.encryption=p.encryption||'none';
      n.sni=p.sni||p.servername||''; n.host=p.host||''; n.path=p.path||'';
      n.alpn=arr(p.alpn); n.fingerprint=p.fp||'';
      n.insecure=+(p.allowInsecure||p.insecure||0)===1;
      n.grpcServiceName=p.serviceName||p.service_name||'';
      n.reality=sec==='reality'?{public_key:p.pbk||'', short_id:String(p.sid||''), spx:p.spx||''}:null;
      n.udp=p.udp!=='false';
      return n;
    }
    if(scheme==='trojan'){
      n.protocol='trojan'; n.name=name||'Trojan';
      n.password=decodeURIComponent(credStr.split(':')[0]||'');
      n.security=p.security||'tls'; n.network=p.type||'tcp';
      n.sni=p.sni||p.peer||server; n.host=p.host||''; n.path=p.path||'';
      n.alpn=arr(p.alpn); n.fingerprint=p.fp||'';
      n.insecure=+(p.allowInsecure||0)===1;
      n.grpcServiceName=p.serviceName||'';
      if(p.security==='reality') n.reality={public_key:p.pbk||'', short_id:String(p.sid||''), spx:p.spx||''};
      return n;
    }
    if(scheme==='ss'||scheme==='shadowsocks'){
      n.protocol='ss'; n.name=name||'Shadowsocks';
      let info=rest, srv=server, pt=port||8388, nm=n.name;
      if(!info.includes('@')){
        let b64=info;
        try{ b64=decodeURIComponent(info); }catch(e){}
        const dec=b64d(b64);
        if(dec){
          let payload=dec, frag2='';
          const h=dec.indexOf('#');
          if(h>=0){ payload=dec.slice(0,h); frag2=fragName(dec.slice(h+1)); }
          const a2=payload.lastIndexOf('@');
          if(a2>=0){
            const mp=payload.slice(0,a2);
            const sp=splitHostPort(payload.slice(a2+1),8388);
            srv=sp[0]; pt=sp[1];
            const ci=mp.indexOf(':');
            n.method=ci>=0?mp.slice(0,ci):mp; n.password=ci>=0?mp.slice(ci+1):'';
            n.server=srv; n.port=pt;
            if(frag2) n.name=frag2;
            n.plugin=p.plugin||''; n.obfsParams=p['plugin-opts']||'';
            return n;
          }
        }
      }
      const ci=credStr.indexOf(':');
      n.method=ci>=0?credStr.slice(0,ci):credStr;
      n.password=ci>=0?decodeURIComponent(credStr.slice(ci+1)):'';
      if(!n.server) n.server=server;
      n.plugin=p.plugin||''; n.obfsParams=p['plugin-opts']||'';
      return n;
    }
    if(scheme==='ssr'){
      let main=rest, fr='';
      const h=main.indexOf('#'); if(h>=0){ fr=main.slice(h+1); main=main.slice(0,h); }
      const q=main.indexOf('/?'); const pp=qs2obj(q>=0?main.slice(q+2):'');
      if(q>=0) main=main.slice(0,q);
      main=main.replace(/[-_]/g,c=>c==='-'?'+':'/');
      const dec=b64d(main); if(!dec) return null;
      const seg=dec.split(':');
      const sp=splitHostPort(seg[0]||'',8388);
      n.protocol='ssr'; n.name=name||frName(fr)||'SSR';
      n.server=sp[0]; n.port=sp[1]; n.method=seg[3]||'chacha20';
      n.password=decodeURIComponent(seg[4]||'');
      n.obfsType=seg[5]||'plain'; n.protocolParam=decodeURIComponent(seg[6]||'');
      n.obfsPassword=decodeURIComponent(seg[7]||'');
      return n;
      function frName(f){ return fragName(f); }
    }
    if(scheme==='hysteria'||scheme==='hysteria2'||scheme==='hy2'){
      n.protocol='hysteria2'; n.name=name||'Hysteria2';
      n.password=decodeURIComponent(credStr.split(':')[0]||'');
      n.sni=p.sni||p.peer||server; n.security='tls';
      n.alpn=arr(p.alpn)||['h3'];
      n.insecure=+(p.insecure||0)===1;
      n.obfsType=p.obfs||''; n.obfsPassword=p['obfs-password']||'';
      n.down=p.downmbps||p.down||''; n.up=p.upmbps||p.up||'';
      n.disableMTUDiscovery=p.disable_mtu_discovery==='1';
      n.fastOpen=p.fastopen==='1';
      return n;
    }
    if(scheme==='tuic'){
      n.protocol='tuic'; n.name=name||'TUIC';
      const ci=credStr.indexOf(':');
      n.uuid=ci>=0?credStr.slice(0,ci):credStr;
      n.password=ci>=0?decodeURIComponent(credStr.slice(ci+1)):'';
      n.sni=p.sni||server; n.alpn=arr(p.alpn)||['h3']; n.security='tls';
      n.congestionControl=p.congestion_control||p.cc||'cubic';
      n.udpRelayMode=p.udp_relay_mode||'native';
      n.insecure=+(p.allow_insecure||p.allowInsecure||0)===1;
      n.disableSNI=+(p.disable_sni||0)===1;
      return n;
    }
    if(scheme==='wireguard'||scheme==='wg'){
      n.protocol='wireguard'; n.name=name||'WireGuard';
      n.privateKey=decodeURIComponent(credStr);
      n.peerPublicKey=p.publickey||p.public_key||'';
      n.preSharedKey=p.preshared_key||'';
      n.localAddress=(p.address||p.allowedips||'10.0.0.2/32').split(',').map(s=>s.trim());
      n.mtu=+p.mtu||1420;
      n.reserved=String(p.reserved||'').split(',').map(s=>s.trim()).filter(x=>x!=='').map(Number);
      n.persistentKeepalive=+p.keepalive||0;
      n.port=port||51820;
      return n;
    }
    if(scheme==='anytls'){
      n.protocol='anytls'; n.name=name||'AnyTLS';
      n.password=decodeURIComponent(credStr.split(':')[0]||'');
      n.sni=p.sni||server; n.security='tls';
      n.alpn=arr(p.alpn)||['h2','http/1.1'];
      n.insecure=+(p.allowinsecure||p.allowInsecure||0)===1;
      n.fingerprint=p.fp||''; n.path=p.path||'';
      return n;
    }
    if(scheme==='socks'||scheme==='socks5'||scheme==='http'||scheme==='https'){
      n.protocol=scheme.startsWith('socks')?'socks5':'http';
      n.name=name||(n.protocol==='socks5'?'Socks5':'HTTP');
      const ci=credStr.indexOf(':');
      n.username=ci>=0?decodeURIComponent(credStr.slice(0,ci)):'';
      n.password=ci>=0?decodeURIComponent(credStr.slice(ci+1)):'';
      n.tls=scheme==='https'; n.security=scheme==='https'?'tls':'none';
      return n;
    }
  }catch(e){ console.warn('URI parse fail:',uri,e); }
  return null;
}
