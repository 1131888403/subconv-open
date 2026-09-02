// Leave empty in the public build. Set this to your own HTTPS relay origin before deploying.
const SELF_HOSTED_RELAY = '';

function dl(blob,name){
  const a=document.createElement('a'); const u=URL.createObjectURL(blob);
  a.href=u; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(u); a.remove(); },800);
}
function $(id){ return document.getElementById(id); }
let SUB_META={source:'browser',upload:0,download:0,total:0,expire:null,used:0,remaining:null,title:null};
function humanBytes(n){ if(n==null) return '未知'; const u=['B','KB','MB','GB','TB']; let x=Number(n)||0,i=0; while(x>=1024&&i<4){x/=1024;i++;} return (i?x.toFixed(2):Math.round(x))+' '+u[i]; }
function renderMeta(){
  const m=SUB_META, has=m.upload||m.download||m.total||m.expire;
  $('c-meta').style.display='block'; $('meta-source').textContent=has?'（响应头）':'（未提供流量信息）';
  $('meta-stats').innerHTML=has ? `<span>上传 <b>${humanBytes(m.upload)}</b></span><span>下载 <b>${humanBytes(m.download)}</b></span><span>已用 <b>${humanBytes(m.used)}</b></span><span>剩余 <b>${humanBytes(m.remaining)}</b></span><span>到期 <b>${m.expire?new Date(m.expire*1000).toLocaleString():'未知'}</b></span>` : '<span>服务器未暴露 Subscription-Userinfo，节点转换仍可继续</span>';
}
function parseUserinfo(v){
  const m={source:'Subscription-Userinfo',upload:0,download:0,total:0,expire:null};
  String(v||'').split(/[;,&]/).forEach(p=>{const a=p.trim().split('='); if(a.length<2)return; const k=a[0].trim().toLowerCase().replace(/-/g,'_'), n=Number(a[1]); if(k==='expire')m.expire=n; else if(['upload','download','total'].includes(k))m[k]=n;});
  m.used=m.upload+m.download; m.remaining=m.total?Math.max(0,m.total-m.used):null; return m;
}
async function fetchText(url){
  const mode=$('i-fetch').value, proxy=$('i-proxy').value.trim(), encoded=encodeURIComponent(url), ua=encodeURIComponent($('i-ua')?.value||'clash-verge/v1.3.6');
  const candidates={
    personal:SELF_HOSTED_RELAY?[SELF_HOSTED_RELAY+'/my-fetch?url='+encoded+'&ua='+ua]:[],
    direct:[url],
    allorigins:['https://api.allorigins.win/raw?url='+encoded],
    codetabs:['https://api.codetabs.com/v1/proxy?quest='+encoded],
    corslol:['https://api.cors.lol/?url='+encoded],
    jina:['https://r.jina.ai/http://'+url.replace(/^https?:\/\//,'')],
  };
  let list;
  if(mode==='custom'){
    if(!proxy) throw Error('请输入自定义代理地址');
    list=[proxy.replaceAll('{url}',encoded).replaceAll('{ua}',ua)];
  } else if(mode==='auto'){
    list=[].concat(candidates.direct,candidates.allorigins,candidates.codetabs,candidates.corslol,candidates.jina);
  } else list=candidates[mode]||candidates.direct;
  let last;
  for(const u of list){
    try{
      const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),20000);
      const r=await fetch(u,{signal:ctrl.signal}); clearTimeout(timer);
      if(!r.ok) throw Error('HTTP '+r.status);
      const h=r.headers.get('subscription-userinfo');
      const text=await r.text();
      const parsed=loadContent(text);
      if(!parsed.n) throw Error(parsed.warn||'响应内容无法解析为节点');
      if(h) SUB_META=parseUserinfo(h);
      return text;
    }catch(e){ last=e.name==='AbortError'?Error('请求超时'):e; }
  }
  throw last||Error('无法抓取订阅');
}
async function createRelay(btn){
  const url=$('i-url').value.trim(), ua=encodeURIComponent($('i-ua').value||'clash-verge/v1.3.6'), tag=encodeURIComponent((NAMETAG&&NAMETAG.mode)||'off');
  if(!url){$('msg').className='msg warn';$('msg').textContent='请先输入订阅 URL';return;}
  if(!SELF_HOSTED_RELAY){$('msg').className='msg warn';$('msg').textContent='此开源版未绑定公共中转；请部署自己的 relay 后设置 SELF_HOSTED_RELAY。';return;}
  const old=btn.textContent; btn.disabled=true; btn.textContent='正在创建…';
  try{const r=await fetch(SELF_HOSTED_RELAY+'/my-create?url='+encodeURIComponent(url)+'&ua='+ua+'&tag='+tag);if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();if(!d.id)throw Error('服务器未返回链接 ID');$('relay-url').value=SELF_HOSTED_RELAY+'/sub/'+d.id;$('relay-result').style.display='block';$('msg').className='msg ok';$('msg').textContent='新的订阅链接已创建，客户端刷新该链接时会按当前标注模式改写节点名';}
  catch(e){$('msg').className='msg err';$('msg').textContent='创建订阅链接失败：'+e.message;}
  finally{btn.disabled=false;btn.textContent=old;}
}
function copyRelay(){const v=$('relay-url').value;if(v)copyText(v);}
async function createConvertedRelay(btn){
  const url=$('i-url').value.trim(), ua=encodeURIComponent($('i-ua').value||'clash-verge/v1.3.6'), tag=encodeURIComponent((NAMETAG&&NAMETAG.mode)||'off');
  const selected=[...document.querySelectorAll('#fmts .choice.on')].map(x=>x.dataset.f).filter(x=>['clash','singbox','v2ray'].includes(x));
  if(!url){$('gmsg').className='msg warn';$('gmsg').textContent='请先在 URL 输入页填写订阅地址';return;}
  if(!SELF_HOSTED_RELAY){$('gmsg').className='msg warn';$('gmsg').textContent='此开源版未绑定公共中转；请部署自己的 relay 后设置 SELF_HOSTED_RELAY。';return;}
  if(selected.length!==1){$('gmsg').className='msg warn';$('gmsg').textContent='转换订阅链接只能选择一种 Clash、sing-box 或 v2ray 格式';return;}
  const options={}; document.querySelectorAll('#opts .choice.on').forEach(x=>options[x.dataset.o]=true);
  const target=selected[0]==='v2ray'?'uri':selected[0]; const old=btn.textContent; btn.disabled=true; btn.textContent='正在创建…';
  try{
    const q='url='+encodeURIComponent(url)+'&ua='+ua+'&tag='+tag+'&target='+encodeURIComponent(target)+'&options='+encodeURIComponent(JSON.stringify(options));
    const r=await fetch(SELF_HOSTED_RELAY+'/my-create?'+q); if(!r.ok)throw Error('HTTP '+r.status);
    const d=await r.json(); if(!d.id)throw Error('服务器未返回链接 ID');
    $('relay-url').value=SELF_HOSTED_RELAY+'/sub/'+d.id; $('relay-result').style.display='block';
    $('gmsg').className='msg ok'; $('gmsg').textContent='转换订阅已创建，客户端刷新时会重新抓取并转换';
  }catch(e){$('gmsg').className='msg err';$('gmsg').textContent='创建转换订阅失败：'+e.message;}
  finally{btn.disabled=false;btn.textContent=old;}
}
function showNodes(){ $('c-nodes').style.display='block'; $('cnt').textContent=NODES.length+' 个节点'; $('nodes').innerHTML=NODES.map(n=>`<div class="node"><b>${esc(n.name)}</b><small>${esc(n._orig&&n._orig!==n.name?n._orig+' · ':'')}${esc(n.protocol)} · ${esc(n.server)}:${esc(n.port)}</small></div>`).join(''); }
let urlInputRevision=0;
function resetUrlResults(){
  urlInputRevision++;
  NODES.length=0;
  SUB_META={source:'browser',upload:0,download:0,total:0,expire:null,used:0,remaining:null,title:null};
  $('c-nodes').style.display='none'; $('c-meta').style.display='none';
  $('nodes').innerHTML=''; $('cnt').textContent=''; $('msg').textContent=''; $('msg').className='msg';
  $('outputs').innerHTML=''; $('empty-out').style.display='block'; $('gmsg').textContent=''; $('gmsg').className='msg';
}
async function run(){
  const revision=urlInputRevision, inputUrl=$('i-url').value.trim(), tab=document.querySelector('.tab.on')?.dataset.t;
  $('loading').style.display='block'; $('msg').textContent=''; SUB_META={source:'browser',upload:0,download:0,total:0,expire:null,used:0,remaining:null};
  try{let text='';
    if(tab==='url') text=await fetchText(inputUrl);
    else if(tab==='file'){const f=$('i-file').files[0]; if(!f)throw Error('请选择文件'); text=await f.text();}
    else text=$('i-text').value;
    if(tab==='url' && revision!==urlInputRevision) return;
    const r=loadContent(text); if(!r.n)throw Error(r.warn||'无法解析订阅'); $('msg').textContent=`${r.format}，解析到 ${r.n} 个节点`; showNodes(); renderMeta();
  }catch(e){if(!(tab==='url' && revision!==urlInputRevision)){$('msg').textContent='错误：'+e.message; $('c-nodes').style.display='none';}} finally{$('loading').style.display='none';}
}
const GENERATED={}; let genSeq=0;
function copyText(text){ navigator.clipboard?.writeText(text).then(()=>{ $('gmsg').className='msg ok'; $('gmsg').textContent='已复制到剪贴板'; }).catch(()=>{ $('gmsg').className='msg warn'; $('gmsg').textContent='复制失败，请使用预览框手动复制'; }); }
function addResult(out,label,name,type,data){
  const card=document.createElement('div'); card.className='result-card';
  const head=document.createElement('div'); head.className='result-head'; head.innerHTML='<span><b>'+label+'</b><small> · '+name+' · '+new Blob([data]).size+' B</small></span>';
  const actions=document.createElement('div'); actions.className='result-actions';
  const pre=document.createElement('pre'); pre.className='preview'; pre.textContent=data;
  [['⬇️ 下载',()=>dl(new Blob([data],{type}),name)],['📋 复制',()=>copyText(data)],['👁️ 预览',()=>pre.classList.toggle('show')]].forEach(([text,fn])=>{const b=document.createElement('button');b.className='btn btn-line mini';b.textContent=text;b.onclick=fn;actions.appendChild(b);});
  card.append(head,actions,pre); out.appendChild(card);
}
function gen(){
  const gmsg=$('gmsg'); if(!NODES.length){gmsg.className='msg err';gmsg.textContent='请先解析订阅';return;}
  const selected=[...document.querySelectorAll('#fmts .choice.on')]; if(!selected.length){gmsg.className='msg warn';gmsg.textContent='请至少选择一种输出格式';return;}
  const opt={}; document.querySelectorAll('#opts .choice.on').forEach(x=>opt[x.dataset.o]=true); const out=$('outputs'); out.innerHTML='';
  const defs={clash:['Clash Meta','config.yaml','text/yaml'],singbox:['sing-box','config.json','application/json'],v2ray:['v2ray 订阅','v2ray.txt','text/plain'],surfboard:['Surge','surge.conf','text/plain'],qx:['Quantumult X','quantumult-x.conf','text/plain']};
  selected.forEach(x=>{const f=x.dataset.f,d=defs[f];let data=f==='clash'?buildClash(NODES,opt):f==='singbox'?buildSing(NODES,opt):f==='v2ray'?b64e(buildV2Ray(NODES,opt)):f==='surfboard'?buildSurge(NODES,opt):buildQX(NODES,opt);if(f==='clash'&&(SUB_META.upload||SUB_META.download||SUB_META.total||SUB_META.expire))data='# Subscription-Userinfo: upload='+SUB_META.upload+'; download='+SUB_META.download+'; total='+SUB_META.total+'; expire='+(SUB_META.expire||0)+'\n'+data;addResult(out,d[0],d[1],d[2],data);});
  addResult(out,'订阅信息','subscription-meta.json','application/json',JSON.stringify({...SUB_META,node_count:NODES.length},null,2)); $('empty-out').style.display='none';gmsg.className='msg ok';gmsg.textContent='已生成 '+selected.length+' 个配置，可下载、复制或预览';$('result-card').scrollIntoView({behavior:'smooth',block:'start'});
}
/* ================= 演示数据 ================= */
function loadDemo(){ const uris=['vless://11111111-2222-3333-4444-555555555555@hk01.example.com:54183?encryption=none&security=reality&type=tcp&sni=demo.example.com&pbk=wfREB0000000000000000000000000000000000000000000000&sid=9480bd1f859c1e#HK01-Demo','vmess://'+b64e(JSON.stringify({v:'2',ps:'US01-WS-Demo',add:'us.example.com',port:'443',id:'b2c3d4e5-f6a7-8901-bcde-f12345678901',net:'ws',path:'/vmess',tls:'tls'}))]; switchTab('text'); $('i-text').value=uris.join('\n'); run(); }
function switchTab(t){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.dataset.t===t));document.querySelectorAll('.pane').forEach(x=>x.classList.remove('on'));$('p-'+t).classList.add('on');}
window.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.tab').forEach(x=>x.onclick=()=>switchTab(x.dataset.t));document.querySelectorAll('.choice').forEach(x=>x.onclick=()=>{if(x.dataset.nt){document.querySelectorAll('#nametag-mode .choice').forEach(y=>{const on=y===x;y.classList.toggle('on',on);y.setAttribute('aria-pressed',String(on));});NAMETAG.mode=x.dataset.nt;NAMETAG.markDup=x.dataset.nt!=='off';refreshNameTags();return;}const on=!x.classList.contains('on');x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));});$('i-url').addEventListener('input',resetUrlResults);$('i-fetch').onchange=()=>{const custom=$('i-fetch').value==='custom';$('i-proxy').style.display=custom?'block':'none';$('custom-hint').style.display=custom?'block':'none';$('ua-hint').textContent=custom?'自定义代理 URL 支持 {url}（订阅地址）和 {ua}（所选客户端 UA）两个占位符；代理服务需负责转发 UA。':'我的服务器会将上方选择的 UA 转发给订阅源。若返回空壳配置，可切换 Clash Meta、Clash Verge、v2rayN 或 sing-box 后重试。';};const u=new URLSearchParams(location.search).get('url')||new URLSearchParams(location.search).get('sub');if(u){switchTab('url');$('i-url').value=u;}});
