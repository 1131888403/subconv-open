/* ============ 节点名标注：出口地址 / 复用检测 ============ */
/* 目的：一眼看出哪些节点其实连的是同一台机器（同 server:port）。
   规则：
   - 改名一律在 applyGrouping 之前做，且返回【新对象】，绝不改写 ALL 里的原节点；
   - 原名存进 n._orig，detectRegion / baseName 优先读 _orig，避免 IP、端口、.ru 之类
     字符串被地区正则误判成分组依据；
   - 复用次数按当前整份解析结果统计；若以后加筛选，再在筛选前保存全量节点计数。 */

const NAMETAG = { mode:'off', markDup:false, ipReady:false };
let _dohCache = null;

const DOH_TTL = 21600;            // 解析结果缓存 6 小时
const DOH_SERVERS = [
  'https://dns.alidns.com/resolve?name=',   // 国内可达 + CORS=*
  'https://doh.pub/resolve?name=',
  'https://cloudflare-dns.com/dns-query?name='
];

/* IPv4 / IPv6 字面量不再解析 */
function isIpLiteral(h){
  const s=String(h||'').replace(/^\[|\]$/g,'');
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true;
  if(/^[0-9a-f:]+$/i.test(s) && s.indexOf(':')>=0) return true;
  return false;
}

/* localStorage 里的 DoH 缓存（惰性加载） */
function dohCache(){
  if(_dohCache) return _dohCache;
  try{ _dohCache = JSON.parse(localStorage.getItem('subconv_doh')||'{}'); }
  catch(e){ _dohCache = {}; }
  if(!_dohCache || typeof _dohCache!=='object') _dohCache={};
  return _dohCache;
}
function dohCacheSave(){
  try{ localStorage.setItem('subconv_doh', JSON.stringify(dohCache())); }catch(e){}
}
function dohCached(host){
  const e=dohCache()[host];
  if(e && e.ip && (Date.now()-(e.t||0)) < DOH_TTL*1000) return e.ip;
  return null;
}

/* 单个域名 → IPv4。逐个候选源尝试，任一成功即缓存。 */
async function resolveOne(host){
  if(isIpLiteral(host)) return host;
  const hit=dohCached(host);
  if(hit) return hit;
  for(const base of DOH_SERVERS){
    try{
      const r = await fetch(base+encodeURIComponent(host)+'&type=A',
        { headers:{ 'Accept':'application/dns-json' }, cache:'default' });
      if(!r.ok) continue;
      const j = await r.json();
      const ans=(j.Answer||[]).filter(a=>a&&a.type===1&&a.data).map(a=>a.data);
      if(ans.length){
        const ip=ans[0];
        dohCache()[host]={ip:ip,t:Date.now()};
        // 缓存过大时按时间淘汰，避免 localStorage 撑爆
        const keys=Object.keys(dohCache());
        if(keys.length>400){
          keys.sort((a,b)=>(dohCache()[a].t||0)-(dohCache()[b].t||0))
              .slice(0, keys.length-400).forEach(k=>delete dohCache()[k]);
        }
        dohCacheSave();
        return ip;
      }
    }catch(e){ /* 换下一个源 */ }
  }
  return null;
}

/* 批量解析（并发≤8，每个请求之间留一点间隔，别把公共 DoH 打爆） */
async function resolveHosts(hosts){
  const uniq=[...new Set(hosts.filter(h=>h && !isIpLiteral(h)))];
  const out={};
  uniq.filter(isIpLiteral).forEach(h=>{ out[h]=h; });
  const pending=uniq.filter(h=>{ const c=dohCached(h); if(c){ out[h]=c; return false; } return true; });
  const CONC=8, GAP=120;
  let i=0;
  async function worker(){
    while(i<pending.length){
      const h=pending[i++];
      out[h]=await resolveOne(h);
      await new Promise(r=>setTimeout(r,GAP));
    }
  }
  const workers=[];
  for(let k=0;k<Math.min(CONC,pending.length);k++) workers.push(worker());
  await Promise.all(workers);
  // 已是 IP 字面量的直接回填
  hosts.filter(h=>h&&isIpLiteral(h)).forEach(h=>{ if(!out[h]) out[h]=h; });
  return out;
}

/* 端点标识：判断“是不是同一台机器”的依据 */
function endpointKey(n, ipMap){
  let host=String(n.server||'');
  if(NAMETAG.mode==='ip' && ipMap){
    const got=ipMap[host];
    if(got) host=got;
  }
  const p=n.port?String(n.port):'';
  return p ? host+':'+p : host;
}

/* 聚合键：协议 + 端点。跨协议同端口不算复用。
   注意必须用 n.protocol —— 解析器把协议写在 protocol 字段上，节点对象没有 type 字段；
   早先用 n.type 会让协议恒为 undefined，导致「ss:443」和「trojan:443」被错误合并成复用。 */
function aggKey(n, ipMap){
  const proto=String(n.protocol||n.type||'?').toLowerCase();
  return proto+'|'+endpointKey(n, ipMap);
}

/* 统计整份订阅里每个端点被多少节点使用 */
function endpointCounts(list, ipMap){
  const m=Object.create(null);
  for(const n of list){
    const k=aggKey(n, ipMap);
    m[k]=(m[k]||0)+1;
  }
  return m;
}

/* 后缀文本。mode=off 且未开重复标注时返回 ''（即不改名）。
   counts 可由调用方传入（删减功能传母本全量计数，避免名字随筛选漂移）。 */
function tagSuffix(n, counts, ipMap){
  const parts=[];
  if(NAMETAG.mode!=='off'){
    let host=String(n.server||'');
    if(NAMETAG.mode==='ip'){
      const got=(ipMap&&ipMap[host])||dohCached(host)||'';
      host=got||('解析失败:'+host);
    }
    parts.push(NAMETAG.mode==='port' ? String(n.port||'') : (host+':'+(n.port||'')));
  }
  if(NAMETAG.markDup){
    const c=(counts||Object.create(null))[aggKey(n, ipMap)]||1;
    parts.push(c>1 ? ('复用'+c) : '独占');
  }
  if(!parts.length) return '';
  return '【'+parts.join(' ')+'】';
}

/* 应用改名：返回新数组/新对象，原数组保持干净 */
function tagNodes(list, ipMap, counts){
  if(NAMETAG.mode==='off' && !NAMETAG.markDup) return list;
  const cts=counts||endpointCounts(list, ipMap);
  return list.map(n=>{
    const sfx=tagSuffix(n, cts, ipMap);
    if(!sfx) return n;
    const orig=String(n._orig||n.name||'');
    const c=Object.assign({}, n, { _orig:orig, name:orig+sfx });
    return c;
  });
}

/* 列出复用端点（同一协议+端点被 ≥2 个节点使用），用于面板说明 */
function dupReport(list, ipMap){
  const g=Object.create(null);
  for(const n of list){
    const k=aggKey(n, ipMap);
    (g[k]=g[k]||[]).push(String(n._orig||n.name||''));
  }
  return Object.entries(g).filter(([,v])=>v.length>1)
    .map(([k,v])=>({ key:k, type:k.split('|')[0], endpoint:k.split('|').slice(1).join('|'), names:v }))
    .sort((a,b)=>b.names.length-a.names.length);
}

function applyNameTagsInPlace(){
  if(!Array.isArray(NODES) || !NODES.length) return;
  NODES.forEach(n=>{ if(!n._orig) n._orig=String(n.name||''); n.name=String(n._orig||n.name||''); });
  const tagged=tagNodes(NODES, NAMETAG.ipMap);
  if(tagged!==NODES) NODES.splice(0,NODES.length,...tagged);
}
function refreshNameTags(){
  if(!Array.isArray(NODES) || !NODES.length) return;
  /* 有母本时走「筛选→标注」管线，复用计数保持基于全量；否则退回旧行为 */
  if(Array.isArray(MASTER) && MASTER.length){ runFilter(); return; }
  applyNameTagsInPlace();
  showNodes();
  const msg=$('msg');
  if(msg){
    const d=dupReport(NODES, NAMETAG.ipMap);
    msg.className=d.length?'msg warn':'msg ok';
    msg.textContent=d.length ? ('已刷新标注；发现 '+d.length+' 个复用入口，最大复用 '+Math.max(...d.map(x=>x.names.length))+' 个节点') : '已刷新节点名标注，未发现同端点复用';
  }
}
async function resolveNodeIPs(btn){
  if(!Array.isArray(NODES) || !NODES.length){ const m=$('msg'); if(m){m.className='msg warn';m.textContent='请先解析订阅';} return; }
  const old=btn?btn.textContent:''; if(btn){btn.disabled=true;btn.textContent='解析中…';}
  const m=$('msg'); if(m){m.className='msg';m.textContent='正在解析 '+new Set(NODES.map(n=>n.server).filter(Boolean)).size+' 个域名/IP…';}
  try{
    NAMETAG.ipMap=await resolveHosts(NODES.map(n=>String(n.server||'')));
    NAMETAG.ipReady=true;
    NAMETAG.mode='ip';
    NAMETAG.markDup=true;
    document.querySelectorAll('#nametag-mode .choice').forEach(x=>{const on=x.dataset.nt==='ip';x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));});
    refreshNameTags();
  }catch(e){ if(m){m.className='msg err';m.textContent='解析 IP 失败：'+e.message;} }
  finally{ if(btn){btn.disabled=false;btn.textContent=old;} }
}
