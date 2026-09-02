/* ============ 节点删减：手动隐藏 / 规则删除 / 复用去重 ============ */
/* 设计约定（改动前请先读）：
   - MASTER 是「解析完成、尚未标注」的母本列表；删减和标注都从它派生，
     这样反复切换筛选条件不会丢节点，也不会让名字越改越长。
   - 复用计数一律基于 MASTER 统计。因为「几个节点名指向同一台机器」是机场的
     客观属性，如果基于当前列表统计，用户删掉 4 个之后剩下那个会从「复用5」
     变成「独占」，名字随筛选漂移。
   - 三档规则叠加，优先级：手动隐藏 > 复用去重 > 关键词规则。
   - 节点稳定标识用 protocol|server|port|原名（nodeKey）。不能用 name，因为
     标注会改写 name；也不能只用 server:port，因为同端点有多个节点名。 */

const FILTER = { hidden:Object.create(null), kw:'', dropDup:false };
let MASTER = [];
let FILTER_APPLIED = { kept:[], removed:[], groups:[] };
let FILTER_SCOPE = 'mem';

/* 节点唯一键（含原名，机场改名后需重新删，UI 已提示） */
function nodeKey(n){
  return [String(n.protocol||'?'), String(n.server||''), String(n.port||''), String(n._orig||n.name||'')].join('\u0001');
}
function strHash(s){
  let h=5381; const x=String(s||'');
  for(let i=0;i<x.length;i++) h=(((h<<5)+h)+x.charCodeAt(i))>>>0;
  return h.toString(36);
}

/* ---------- 关键词规则 ----------
   单个词命中即删（OR）；`!` 前缀为排除，命中排除词的节点不删。
     hk              名字包含 hk
     type:hysteria2  按协议（别名 hy2/hysteria 同义）
     port:34567      按端口
     re/^🇭🇰/         正则（第二个 / 后可加 i 等标志）
     纯 `!hk`        不触发删除（只作为其他规则的豁免） */
const PROTO_ALIAS={hy2:'hysteria2',hysteria:'hysteria2',ssr:'ssr',shadowsocks:'ss',v2ray:'vmess'};
function normProto(p){ const s=String(p||'').toLowerCase(); return PROTO_ALIAS[s]||s; }

function parseKwRules(s){
  const out={name:[],not:[],types:[],notTypes:[],ports:[],notPorts:[],re:[],notRe:[]};
  String(s||'').split(/[\s,，、;；]+/).filter(Boolean).forEach(tk=>{
    const neg=/^[!！]/.test(tk), x=tk.replace(/^[!！]/,'');
    if(!x) return;
    let m;
    if((m=/^(?:type|proto|协议)[:：](.*)$/i.exec(x))){ const v=normProto(m[1]); if(v)(neg?out.notTypes:out.types).push(v); return; }
    if((m=/^(?:port|端口)[:：](\d+)$/.exec(x))){ const v=+m[1]; if(v)(neg?out.notPorts:out.ports).push(v); return; }
    if((m=/^re\/(.+)\/([a-z]*)$/i.exec(x))){ try{const r=new RegExp(m[1],m[2]);(neg?out.notRe:out.re).push(r);}catch(e){} return; }
    /* 裸数字：多数人想按端口删，同时也匹配名字（如「0.1x」「1倍率」）。
       两者取并集，符合直觉；要只匹配名字请用 re/^443$/。 */
    if(/^\d+$/.test(x)){ const v=+x; if(v && !neg) out.ports.push(v); }
    (neg?out.not:out.name).push(x.toLowerCase());
  });
  out.active=!!(out.name.length||out.types.length||out.ports.length||out.re.length);
  return out;
}

/* 返回命中的类别数组（空=未命中；豁免则返回 null），供展示时说明「为什么删」 */
function ruleHits(n, r){
  const raw=String(n._orig||n.name||'');
  const low=raw.toLowerCase(), proto=normProto(n.protocol), port=+n.port||0;
  const hits=[];
  if(r.name.some(k=>low.indexOf(k)>=0)) hits.push('关键词');
  if(r.types.some(t=>proto===t))        hits.push('协议');
  if(r.ports.some(p=>port===p))         hits.push('端口');
  if(r.re.some(x=>{ try{return x.test(raw);}catch(e){return false;} })) hits.push('正则');
  if(!hits.length) return null;
  const exempt=r.not.some(k=>low.indexOf(k)>=0)
            || r.notTypes.some(t=>proto===t)
            || r.notPorts.some(p=>port===p)
            || r.notRe.some(x=>{ try{return x.test(raw);}catch(e){return false;} });
  return exempt ? null : hits;
}

/* ---------- 主流程：母本 → 筛选 → 标注 → NODES ---------- */
function applyFilters(master, counts){
  const hidden=FILTER.hidden, kw=parseKwRules(FILTER.kw), ipMap=NAMETAG.ipMap;
  const kept=[], removed=[];
  /* 复用组代表：隐藏后组内第一个存活的节点，保证结果稳定可预期 */
  const rep=Object.create(null);
  if(FILTER.dropDup){
    for(const n of master){
      if(hidden[nodeKey(n)]) continue;
      const k=aggKey(n, ipMap);
      if(counts[k]>1 && !rep[k]) rep[k]=nodeKey(n);
    }
  }
  for(const n of master){
    const k=nodeKey(n), ak=aggKey(n, ipMap);
    if(hidden[k]){ removed.push({node:n, kind:'手动', why:'手动'}); continue; }
    if(FILTER.dropDup && counts[ak]>1 && rep[ak]!==k){ removed.push({node:n, kind:'复用去重', why:'复用去重'}); continue; }
    if(kw.active){ const hs=ruleHits(n, kw);
      if(hs){ removed.push({node:n, kind:'关键词', why:hs.join('+')}); continue; } }
    kept.push(n);
  }
  return {kept, removed, groups:dupReport(master, ipMap)};
}

function applyFilterAndTags(){
  if(!Array.isArray(MASTER) || !MASTER.length){
    NODES.length=0; FILTER_APPLIED={kept:[],removed:[],groups:[]}; return;
  }
  const counts=endpointCounts(MASTER, NAMETAG.ipMap);
  FILTER_APPLIED=applyFilters(MASTER, counts);
  const tagged=tagNodes(FILTER_APPLIED.kept, NAMETAG.ipMap, counts);
  NODES.length=0;
  Array.prototype.push.apply(NODES, tagged);
}

/* ---------- 持久化：按「输入来源」存，换订阅不会串味 ---------- */
function currentTab(){
  try{ const el=document.querySelector('.tab.on'); return (el&&el.dataset&&el.dataset.t)||'url'; }catch(e){ return 'url'; }
}
function filterScopeId(){
  const tab=currentTab();
  try{
    if(tab==='url'){ const v=String(($('i-url')&&$('i-url').value)||'').trim(); if(v) return 'url:'+v; }
    if(tab==='file'){ const f=$('i-file')&&$('i-file').files&&$('i-file').files[0]; if(f) return 'file:'+f.name+':'+(f.size||0); }
    if(tab==='text'){ const v=String(($('i-text')&&$('i-text').value)||''); if(v.trim()) return 'txt:'+strHash(v.length+'#'+v.slice(0,65536)); }
  }catch(e){}
  return 'mem';
}
function filterStoreKey(){ return 'subconv_filter::'+strHash(FILTER_SCOPE); }
function filterSave(){
  FILTER_SCOPE=filterScopeId();
  if(FILTER_SCOPE==='mem') return;              /* 粘贴/文件内容无稳定标识，只在本次会话生效 */
  try{
    localStorage.setItem(filterStoreKey(), JSON.stringify({
      v:1, kw:FILTER.kw, dropDup:!!FILTER.dropDup, hidden:Object.keys(FILTER.hidden)
    }));
  }catch(e){}
}
function filterLoad(scope){
  FILTER_SCOPE=scope||filterScopeId();
  FILTER.hidden=Object.create(null); FILTER.kw=''; FILTER.dropDup=false;
  if(FILTER_SCOPE==='mem') return false;
  try{
    const j=JSON.parse(localStorage.getItem(filterStoreKey())||'null');
    if(!j||typeof j!=='object') return false;
    FILTER.kw=String(j.kw||''); FILTER.dropDup=!!j.dropDup;
    (Array.isArray(j.hidden)?j.hidden:[]).forEach(k=>{ FILTER.hidden[k]=1; });
    return true;
  }catch(e){ return false; }
}

/* ---------- UI ---------- */
function filterSummary(){
  const t=MASTER.length, k=FILTER_APPLIED.kept.length||0, d=t-k;
  const parts=['母本 '+t, '生效 '+k];
  if(d) parts.push('已删 '+d);
  const manual=FILTER_APPLIED.removed.filter(x=>x.kind==='手动').length;
  const dup=FILTER_APPLIED.removed.filter(x=>x.kind==='复用去重').length;
  const kw=FILTER_APPLIED.removed.filter(x=>x.kind==='关键词').length;
  if(manual) parts.push('手动 '+manual);
  if(dup) parts.push('复用去重 '+dup);
  if(kw) parts.push('关键词 '+kw);
  return parts.join(' · ');
}

function renderFilterPanels(){
  const box=$('f-removed');
  if(box){
    const rs=FILTER_APPLIED.removed||[];
    box.style.display=rs.length?'block':'none';
    box.innerHTML='<b>被删除的节点（点 ↺ 恢复）</b>'+rs.slice(0,200).map((x,i)=>
      '<div class="f-row"><span class="f-nm">'+esc(String(x.node._orig||x.node.name||''))+
      '</span><span class="f-ad">'+esc(x.node.protocol)+' · '+esc(x.node.server)+':'+esc(x.node.port)+'</span>'+
      '<span class="f-why">'+esc(x.why)+'</span>'+
      '<button type="button" class="node-x" title="恢复" onclick="restoreRemoved('+i+')">↺</button></div>').join('')+
      (rs.length>200?'<div class="f-more">…另有 '+(rs.length-200)+' 个未列出</div>':'');
  }
  const gb=$('f-groups');
  if(gb){
    const gs=FILTER_APPLIED.groups||[];
    gb.style.display=gs.length?'block':'none';
    if(gs.length){
      /* 按「当前存活数」给按钮标数字：母本成员可能已被手动删除，
         用 names.length-1 会承诺一个做不到的数字。 */
      const keptCnt=Object.create(null);
      for(const n of (FILTER_APPLIED.kept||[])){ const k=aggKey(n, NAMETAG.ipMap); keptCnt[k]=(keptCnt[k]||0)+1; }
      gb.innerHTML='<b>复用入口（同协议 + 同地址端口）</b>'+gs.map((g,i)=>{
        const alive=keptCnt[g.type+'|'+g.endpoint]||0;
        const btn=alive>1
          ? '<button type="button" class="node-x" title="该组只留第一个存活节点，其余隐藏" onclick="hideGroupExtra('+i+')">留1删'+(alive-1)+'</button>'
          : '<span class="f-why">已无多余</span>';
        return '<div class="f-row"><span class="f-ad">'+esc(g.type)+' · '+esc(g.endpoint)+'</span>'+
               '<span class="f-nm">'+esc(g.names.join(' / '))+'</span>'+btn+'</div>';
      }).join('');
    }
  }
  const st=$('f-stats');
  if(st) st.textContent=filterSummary();
  const inp=$('f-kw');
  if(inp && inp.value!==FILTER.kw) inp.value=FILTER.kw;
  const dd=document.querySelector('#f-dup');
  if(dd && dd.classList){ dd.classList.toggle('on',!!FILTER.dropDup); if(dd.setAttribute) dd.setAttribute('aria-pressed',String(!!FILTER.dropDup)); }
}

function runFilter(){
  applyFilterAndTags();
  showNodes();
  renderFilterPanels();
  const m=$('msg');
  if(m){
    const d=(FILTER_APPLIED.removed||[]).length;
    m.className=d?'msg warn':'msg';
    m.textContent=d?('已删 '+d+' 个节点，生效 '+FILTER_APPLIED.kept.length+' 个；生成配置与二维码均使用删减后的结果')
                   :'未删除任何节点';
  }
}

function toggleDupDrop(){
  FILTER.dropDup=!FILTER.dropDup;
  filterSave(); runFilter();
}
function filterInputChanged(v){
  FILTER.kw=String(v||'');
  filterSave();
  runFilter();
}
function toggleNodeHidden(i){
  const n=NODES[i]; if(!n) return;
  FILTER.hidden[nodeKey(n)]=1;
  filterSave(); runFilter();
}
function restoreRemoved(i){
  const x=(FILTER_APPLIED.removed||[])[i]; if(!x) return;
  delete FILTER.hidden[nodeKey(x.node)];
  filterSave(); runFilter();
}
/* 一键：某个复用组只留第一个【当前仍存活】的节点，其余隐藏。
   代表不能取母本的 names[0] —— 它可能已被手动删除，那样会把整组删光。 */
function hideGroupExtra(gi){
  const g=(FILTER_APPLIED.groups||[])[gi]; if(!g) return;
  const want=g.type+'|'+g.endpoint;
  const keptList=FILTER_APPLIED.kept||[];
  let keepKey=null;
  for(const n of keptList){ if(aggKey(n, NAMETAG.ipMap)===want){ keepKey=nodeKey(n); break; } }
  if(keepKey===null) return;                 /* 组内已无存活节点，不再操作 */
  for(const n of MASTER){
    if(aggKey(n, NAMETAG.ipMap)===want && nodeKey(n)!==keepKey) FILTER.hidden[nodeKey(n)]=1;
  }
  filterSave(); runFilter();
}
function clearAllHidden(){
  FILTER.hidden=Object.create(null);
  FILTER.kw=''; FILTER.dropDup=false;
  filterSave(); runFilter();
}
function copyRemovedList(){
  const rs=FILTER_APPLIED.removed||[];
  if(!rs.length){ const m=$('msg'); if(m){m.className='msg warn';m.textContent='当前没有删除任何节点';} return; }
  copyText(rs.map(x=>String(x.node._orig||x.node.name||'')).join('\n'));
}
function exportFilteredSubscription(){
  const tagged=tagNodes(FILTER_APPLIED.kept, NAMETAG.ipMap, endpointCounts(MASTER, NAMETAG.ipMap));
  const lines=tagged.map(n=>node2uri(n)).filter(Boolean);
  if(!lines.length){ const m=$('msg'); if(m){m.className='msg err';m.textContent='没有可导出的节点';} return; }
  addResult($('outputs'),'删减后订阅（URI）','filtered-subscription.txt','text/plain', b64e(lines.join('\n')));
  $('empty-out').style.display='none';
  const g=$('gmsg'); if(g){g.className='msg ok';g.textContent='已导出删减后的订阅（'+lines.length+' 个节点，Base64 URI）';}
  $('result-card').scrollIntoView({behavior:'smooth',block:'start'});
}
