/* ================= Clash dict → Node ================= */
function clashNode(p){
  if(!p||typeof p!=='object'||!p.type||!p.server) return null;
  const t=String(p.type).toLowerCase();
  const map={vmess:'vmess',vless:'vless',trojan:'trojan',ss:'ss',shadowsocks:'ss',
    hysteria2:'hysteria2',hysteria:'hysteria2',hy2:'hysteria2',tuic:'tuic',
    wireguard:'wireguard',anytls:'anytls',socks5:'socks5',socks:'socks5',http:'http',https:'http'};
  const proto=map[t]; if(!proto) return null;
  const ws=p['ws-opts']||p.ws||{}, grpc=p['grpc-opts']||p.grpc||{}, h2=p['h2-opts']||{},
        httpOpt=p['http-opts']||{}, gr=p['reality-opts']||p.reality||null,
        h3=p['h3-opts']||{}, ssh=p['ssh-opts']||{};
  const arr=v=>Array.isArray(v)?v:(v?String(v).split(','):null);
  const n={protocol:proto, name:p.name||proto, server:String(p.server), port:+p.port||443,
    uuid:p.uuid||p['client-id']||p.client_uuid||'', password:p.password||'',
    alterId:+(p.alterId!=null?p.alterId:p['alter_id'])||0,
    cipher:p.cipher||p.method||'', method:p.method||p.cipher||'',
    network:p.network||'tcp', security:p.tls?(p['reality-opts']?'reality':'tls'):(p.security||'none'),
    sni:p.servername||p.sni||p.sname||h3.sni||'', host:(ws.headers&&(ws.headers.Host||ws.headers.host))||h2.headers&&h2.headers.Host||p.host||'',
    path:ws.path||h2.path||httpOpt.path||p['ws-path']||p.path||'',
    alpn:arr(p.alpn), fingerprint:p['client-fingerprint']||p.fingerprint||'',
    insecure:!!p['skip-cert-verify'], flow:p.flow||'',
    reality:gr?{public_key:gr['public-key']||gr.public_key||'', short_id:String(gr['short-id']!=null?gr['short-id']:(gr.short_id||'')), spx:gr['public-key']?(gr.spx||''):''}:null,
    grpcServiceName:grpc['grpc-service-name']||'',
    obfsType:p.obfs||'', obfsPassword:p['obfs-password']||'',
    plugin:p.plugin||'', obfsParams:p['plugin-opts']||'',
    udp:p.udp!==false, raw:null};
  if(proto==='vmess'&&!n.cipher) n.cipher='auto';
  if(proto==='ss'&&!n.cipher) n.cipher=n.method||'chacha20-ietf-poly1305';
  if(proto==='hysteria2'){ n.alpn=n.alpn||['h3']; n.down=p.down||''; n.up=p.up||'';
    n.disableMTUDiscovery=!!p['disable-mtu-discovery']; }
  if(proto==='tuic'){ n.congestionControl=p['congestion-controller']||p.congestion_control||'cubic';
    n.udpRelayMode=p['udp-relay-mode']||p.udp_relay_mode||'native'; }
  if(proto==='wireguard'){ n.privateKey=p['private-key']||p.private_key||'';
    n.peerPublicKey=p['public-key']||p['peer-public-key']||p.public_key||'';
    n.preSharedKey=p['preshared-key']||p.pre_shared_key||'';
    const ip=p.ip||p['local-address']||'';
    n.localAddress=(Array.isArray(ip)?ip:String(ip).split(',')).map(s=>String(s).trim()).filter(Boolean);
    n.mtu=+p.mtu||1420; n.reserved=(arr(p.reserved)||[]).map(Number); }
  if(proto==='anytls'){ n.security=n.tls?'tls':'none'; }
  if(proto==='socks5'||proto==='http'){ n.username=p.username||''; n.password=p.password||''; }
  return n;
}
/* ================= sing-box outbound → Node ================= */
function singOutNode(o){
  if(!o||typeof o!=='object'||!o.type||!o.server) return null;
  const map={vmess:'vmess',vless:'vless',trojan:'trojan',shadowsocks:'ss',hysteria2:'hysteria2',
    tuic:'tuic',wireguard:'wireguard',anytls:'anytls',socks:'socks5',http:'http'};
  const proto=map[o.type]; if(!proto) return null;
  const tls=o.tls||{}, tr=o.transport||{}, hl=tr.headers||{};
  const rl=tls.reality||{}, arr=v=>Array.isArray(v)?v:(v?String(v).split(','):null);
  const n={protocol:proto, name:o.tag||o.type, server:String(o.server), port:+o.server_port||443,
    uuid:o.uuid||'', password:o.password||'', method:o.method||o.security||'',
    cipher:o.security||o.method||'', network:tr.type||'tcp',
    security:rl.enabled?'reality':(tls.enabled?'tls':'none'),
    sni:tls.server_name||'', host:hl.Host||hl.host||'', path:tr.path||'',
    alpn:arr(tls.alpn), fingerprint:(tls.utls||{}).fingerprint||'',
    insecure:!!tls.insecure, flow:o.flow||'',
    reality:rl.enabled?{public_key:rl.public_key||'', short_id:String(rl.short_id||''), spx:rl.handshake?((rl.handshake.path)||''):''}:null,
    grpcServiceName:tr.service_name||'', udp:o.udp_hop_interval!==undefined||true};
  if(proto==='vmess'){ n.alterId=o.alter_id||0; if(!n.cipher) n.cipher='auto'; }
  if(proto==='hysteria2'){ n.obfsType=(o.obfs||{}).type||''; n.obfsPassword=(o.obfs||{}).password||'';
    n.downMbps=o.down_mbps||''; n.upMbps=o.up_mbps||''; n.alpn=n.alpn||['h3'];
    n.disableMTUDiscovery=o.disable_mtu_discovery; }
  if(proto==='tuic'){ n.congestionControl=o.congestion_control||'cubic'; n.udpRelayMode=o.udp_relay_mode||'native'; }
  if(proto==='wireguard'){ n.privateKey=o.private_key||''; n.peerPublicKey=o.peer_public_key||'';
    n.preSharedKey=o.pre_shared_key||''; n.localAddress=(o.local_address||[]).slice();
    n.mtu=o.mtu||1420; n.reserved=(Array.isArray(o.reserved)?o.reserved:String(o.reserved||'').split(',')).map(x=>+x).filter(x=>!isNaN(x));
    n.port=+o.server_port||51820; }
  if(proto==='ss'&&!n.cipher) n.cipher=n.method;
  return n;
}
/* ================= 统一载入 ================= */
function collect(obj,found){
  if(!obj||typeof obj!=='object') return;
  [['proxies'],['Proxies'],['Proxy']].forEach(keys=>{
    keys.forEach(k=>{ const arr=obj[k];
      if(!Array.isArray(arr)) return;
      arr.forEach(p=>{
        if(typeof p==='string'){ const n=parseURI(p); if(n) found.push(n); return; }
        if(!p||typeof p!=='object') return;
        if(p.type==='select'||p.type==='url-test'||p.type==='fallback'||p.type==='load-balance'){
          (p.proxies||[]).forEach(x=>{}); return;   /* proxy-group：跳过 */
        }
        const n=clashNode(p); if(n) found.push(n);
      });
    });
  });
  if(Array.isArray(obj.outbounds)) obj.outbounds.forEach(o=>{ const n=singOutNode(o); if(n) found.push(n); });
  if(obj.Proxy) String(obj.Proxy).split(/\r?\n/).forEach(l=>{ const n=surgeLine(l); if(n) found.push(n); });
}
const NODES=[];
function loadContent(text){
  NODES.length=0;
  MASTER=[];
  FILTER_APPLIED={kept:[],removed:[],groups:[]};
  const found=[];
  const t=String(text||'').trim();
  if(!t) return {n:0, format:'空内容'};

  /* 1) JSON (sing-box) */
  if(/^[{[]/.test(t)){
    try{
      const j=JSON.parse(t);
      collect(j,found);
      if(found.length) return done(found,'sing-box JSON');
    }catch(e){}
  }
  /* 2) Surge CONF */
  if(/^\s*\[\s*Proxy\s*\]/im.test(t)){
    const sec=surgeSections(t);
    (sec['Proxy']||[]).concat(sec['proxy']||[]).forEach(l=>{ const n=surgeLine(l); if(n) found.push(n); });
    if(found.length) return done(found,'Surge CONF');
  }
  /* 3) Clash YAML */
  if(/(^|\n)\s*proxies?\s*[::]/.test(t)||/(^|\n)\s*proxy-groups\s*[::]/.test(t)){
    let y=null;
    try{ y=parseYAML(t); }catch(e){ console.warn('yaml fail',e); }
    if(y){
      collect(y,found);
      if(found.length) return done(found,'Clash YAML');
      const empty=Array.isArray(y.proxies)&&y.proxies.length===0;
      return {n:0, format:'Clash YAML',
        warn: empty ? '该 Clash 配置里的 proxies 是空的（机场按当前 User-Agent 下发了空壳模板）。请用 Clash Verge / v2rayN 抓取后复制原始 URI 订阅粘贴到「粘贴内容」。' : ''};
    }
  }
  /* 4) URI 列表 / Base64 订阅 */
  let lines=t.split(/\r?\n/).map(x=>trimStr(x)).filter(Boolean);
  const URI_RE=/^(vmess|vless|trojan|ss|ssr|hysteria2?|hy2|tuic|wireguard|wg|anytls|socks5?|https?):\/\//i;
  let looksURI=lines.some(l=>URI_RE.test(l));
  if(!looksURI){
    const dec=b64d(t.replace(/\s+/g,''));
    if(dec && dec.split(/\r?\n/).some(l=>URI_RE.test(trimStr(l)))){
      lines=dec.split(/\r?\n/).map(x=>trimStr(x)).filter(Boolean);
      looksURI=true;
    }
  }
  if(looksURI){
    lines.forEach(l=>{
      let line=l;
      if(!URI_RE.test(line)){ const d=b64d(line); if(d&&URI_RE.test(trimStr(d))) line=trimStr(d); }
      if(!URI_RE.test(line)) return;
      const n=parseURI(line);
      if(n) found.push(n);
    });
    if(found.length) return done(found,'URI 订阅');
  }
  return {n:0, format:'未知', warn:'无法识别内容格式。请确认粘贴的是完整订阅（Base64 订阅串 / Clash YAML / sing-box JSON / URI 列表）。'};

  function done(list,fmt){
    list.forEach(x=>{ if(!NODES.some(y=>y.protocol===x.protocol&&y.server===x.server&&y.port===x.port&&y.uuid===x.uuid&&y.password===x.password&&y.name===x.name)) NODES.push(x); });
    const fallback=parseNameMetadata(NODES);
    if(fallback.meta && SUB_META.source!=='Subscription-Userinfo'){ SUB_META=Object.assign(SUB_META,fallback.meta); fallback.drop.forEach(n=>{const i=NODES.indexOf(n);if(i>=0)NODES.splice(i,1);}); }
    dedupeNames(NODES);
    NODES.forEach(n=>{ n._orig=String(n._orig||n.name||''); });
    /* 母本 = 解析结果本身（未标注）；随后按删减规则派生 NODES。
       tagNodes 生成的是新对象，因此 MASTER 里的节点名始终保持原始值。 */
    MASTER=NODES.slice();
    const restored=filterLoad(filterScopeId());
    applyFilterAndTags();
    if(!restored) renderFilterPanels();
    return {n:NODES.length, format:fmt, master:MASTER.length, removed:(FILTER_APPLIED.removed||[]).length, restored:restored};
  }
}
function parseNameMetadata(list){
  const m={source:'node-name',upload:0,download:0,total:0,expire:null}, drop=new Set(); let remain=0;
  const size=/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|K|M|G|T)(?:B)?/i;
  list.forEach(n=>{
    const text=String(n.name||''), low=text.toLowerCase();
    const traffic=/流量|用量|traffic|quota|剩余|remain|used|total/.test(low);
    const expiry=/到期|有效期|expire|expires|valid/.test(low);
    if(!traffic&&!expiry)return;
    let hit=false, x=text.match(size);
    if(x&&traffic){const u=x[2].toUpperCase(), p={B:0,K:1,KB:1,M:2,MB:2,G:3,GB:3,T:4,TB:4}[u], v=Math.floor(Number(x[1])*Math.pow(1024,p)); if(/剩余|remain|left/.test(low))remain=Math.max(remain,v); else if(/已用|used|upload|download/.test(low))m.download=Math.max(m.download,v); else m.total=Math.max(m.total,v); hit=true;}
    let d=text.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})(?:日)?(?:[ T](\d{1,2})[:：](\d{2})(?::(\d{2}))?)?/);
    if(d&&expiry){m.expire=Math.floor(new Date(Date.UTC(+d[1],+d[2]-1,+d[3],d[4]||23,d[5]||59,d[6]||59)).getTime()/1000);hit=true;}
    const u=text.match(/(?<!\d)(1\d{9,})(?!\d)/); if(u&&expiry){m.expire=+u[1];hit=true;} if(hit)drop.add(n);
  });
  m.used=m.upload+m.download; if(remain)m.total=Math.max(m.total,remain+m.used); m.remaining=m.total?Math.max(0,m.total-m.used):null; return {meta:(m.total||m.used||m.expire)?m:null,drop};
}
function dedupeNames(list){
  const seen={};
  list.forEach(n=>{
    let base=n.name||n.protocol;
    if(seen[base]!=null){ seen[base]++; n.name=base+' #'+seen[base]; }
    else seen[base]=0;
  });
}
