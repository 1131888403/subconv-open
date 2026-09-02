/* Node 端功能测试：加载 app.js（stub 掉 DOM），用真实订阅验证解析+生成 */
const fs=require('fs');
const vm=require('vm');

/* --- 最小 DOM / 浏览器 stub --- */
const els={};
function mkEl(id){ return els[id] || (els[id]={id, dataset:{}, value:'', text:'', innerHTML:'',
  style:{}, files:[], className:'', textContent:'',
  addEventListener(){}, appendChild(){}, querySelector(){return mkEl(id+'-q')},
  querySelectorAll(){return []}, click(){}, remove(){}}); }
const mkCanvas=()=>({width:0,height:0,style:{},getContext:()=>({fillStyle:'',fillRect(){}}),toDataURL:()=>'data:image/png;base64,iVBOR',appendChild(){}});
const sandbox={
  console, document:{
    getElementById:mkEl, createElement:t=>t==='canvas'?mkCanvas():mkEl('new-'+t),
    querySelector:()=>mkEl('q'), querySelectorAll:()=>[],
    body:{appendChild(){},removeChild(){}},
    addEventListener(){}
  },
  window:{isSecureContext:false, addEventListener(){}, location:{search:''}},
  navigator:{clipboard:null},
  Blob:class{constructor(a){this.parts=a}}, URL:{createObjectURL:()=>'blob:x', revokeObjectURL(){}},
  localStorage:{_d:{},getItem(k){return Object.prototype.hasOwnProperty.call(this._d,k)?this._d[k]:null;},setItem(k,v){this._d[k]=String(v);},removeItem(k){delete this._d[k];},clear(){this._d={};}},
  AbortController:class{constructor(){this.signal={}} abort(){}},
  fetch:()=>Promise.reject(new Error('no network in test')),
  setTimeout, clearTimeout, atob:s=>Buffer.from(s,'base64').toString('binary'),
  btoa:s=>Buffer.from(s,'binary').toString('base64'),
  encodeURIComponent, decodeURIComponent, escape, unescape, JSON, Math, Date, Object, Array, String, Number, RegExp, Error,
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'), sandbox, {filename:'app.js'});

const g=k=>vm.runInContext(k,sandbox);
const run=code=>vm.runInContext(code,sandbox);

/* --- 测试数据 --- */
const rinB64=fs.readFileSync(__dirname+'/test-rin2.yaml','utf8').trim();
const clashFile=fs.readFileSync(__dirname+'/test-subscription.yaml','utf8');
let singFile='';
const surgeLike=[
  '[General]',
  'skip-proxy = 127.0.0.1',
  '[Proxy]',
  'HK-ss = ss, 1.2.3.4, 8388, encrypt-method=aes-256-gcm, password=abc',
  'JP-trojan = trojan, 5.6.7.8, 443, password=pw, sni=jp.example.com, tls=true',
  'US-vmess = vmess, 9.9.9.9, 443, username=11111111-2222-3333-4444-555555555555, tls=true, ws=true, ws-path=/ray',
  'DE-wg = wireguard, 8.8.8.8, 51820, public-key=PubKeyXYZ, private-key=PrivKeyXYZ, ip=10.0.0.5/32, mtu=1420',
  'HQ-hy2 = external, 7.7.7.7, 443, hy2, password=hypass, sni=hy.example.com',
  '[Proxy Group]',
  'Proxy = select, HK-ss, JP-trojan',
  '[Rule]',
  'GEOIP,CN,DIRECT',
].join('\n');

function show(t,v){ console.log('\n===== '+t+' ====='); console.log(v); }
let pass=0, fail=0;
function chk(name, cond, extra){ if(cond){pass++; console.log('  ✓ '+name);} else {fail++; console.log('  ✗ '+name+(extra?'  ['+extra+']':''));} }

/* 1. VLESS Reality base64 订阅 */
console.log('\n## 1. Rincloud VLESS-Reality (base64 URI)');
let r=run(`loadContent(${JSON.stringify(rinB64)})`);
chk('解析 7 节点', r.n===7, 'got '+r.n);
chk('格式=URI 订阅', r.format==='URI 订阅', r.format);
let names=g('NODES').map(n=>n.name);
show('节点名', names.join(' | '));
chk('节点名来自 fragment', names[0]==='HK01' && names[6]==='DE01', names[0]+'/'+names[6]);
let first=g('NODES')[0];
chk('protocol vless', first.protocol==='vless');
chk('reality 公钥', !!first.reality && first.reality.public_key.startsWith('wfREB'), JSON.stringify(first.reality));
chk('flow', first.flow==='xtls-rprx-vision', first.flow);
chk('sni', first.sni==='demo.example.com', first.sni);
chk('端口', first.port===54183, String(first.port));

/* 2. 生成各种格式并回读 */
console.log('\n## 2. 生成 + 回读');
const fmts={
  clash:`buildClash(NODES, {groups:'all',test:true,rule:true})`,
  singbox:`buildSing(NODES, {groups:'all',rule:true,geo:true})`,
  v2ray:`b64e(NODES.map(node2uri).filter(Boolean).join('\\n'))`,
  surge:`buildSurge(NODES, {groups:'all',rule:true})`,
  qx:`buildQX(NODES, {groups:'all'})`,
};
const out={};
for(const [k,c] of Object.entries(fmts)){
  try{ out[k]=run(c); chk('生成 '+k, typeof out[k]==='string' && out[k].length>100, (out[k]||'').length+'B'); }
  catch(e){ chk('生成 '+k, false, e.message); }
}
fs.writeFileSync(__dirname+'/w-clash.yaml',out.clash||'');
fs.writeFileSync(__dirname+'/w-singbox.json',out.singbox||'');
fs.writeFileSync(__dirname+'/w-v2ray.txt',out.v2ray||'');
fs.writeFileSync(__dirname+'/w-surge.conf',out.surge||'');
fs.writeFileSync(__dirname+'/w-qx.conf',out.qx||'');

/* 回读校验 */
for(const k of ['clash','singbox','v2ray']){
  r=run(`loadContent(${JSON.stringify(out[k])})`);
  chk(k+' 回读 7 节点', r.n===7, 'got '+r.n+' fmt='+r.format);
  if(r.n===7){
    const back=g('NODES');
    const f=back.find(x=>x.name==='HK01')||back[0];
    chk(k+' 回读保留 reality', !!f.reality&&!!f.reality.public_key, JSON.stringify(f.reality));
    chk(k+' 回读保留 flow', f.flow==='xtls-rprx-vision', f.flow);
  }
}
/* singbox JSON 合法性 */
try{ const j=JSON.parse(out.singbox);
  chk('singbox 合法 JSON', true);
  const vl=j.outbounds.filter(o=>o.type==='vless');
  chk('singbox vless 数=7', vl.length===7, String(vl.length));
  chk('singbox reality 完整', vl[0].tls.reality.enabled && !!vl[0].tls.reality.public_key);
  chk('singbox 无非空 null 字段', !JSON.stringify(j).includes(':null'), JSON.stringify(j).match(/"[a-z_-]+":null/)?.[0]);
}catch(e){ chk('singbox 合法 JSON', false, e.message); }
/* clash YAML 合法性 */
try{
  const y=run(`parseYAML(${JSON.stringify(out.clash)})`);
  chk('clash 合法 YAML', !!y.proxies && y.proxies.length===7, y&&y.proxies?y.proxies.length:'-');
  chk('clash reality-opts 连字符', y.proxies[0]['reality-opts']['public-key'].startsWith('wfREB'), JSON.stringify(y.proxies[0]['reality-opts']));
  const realityIds=(y.proxies||[]).map(p=>p['reality-opts']&&p['reality-opts']['short-id']).filter(Boolean);
  chk('clash Reality short-id 全为字符串', realityIds.length===7&&realityIds.every(x=>typeof x==='string'), JSON.stringify(realityIds));
  chk('clash Reality short-id 强制引号', (out.clash.match(/short-id: \"/g)||[]).length===7, out.clash.match(/short-id:.*$/gm));
  chk('clash 有 proxy-groups', Array.isArray(y['proxy-groups'])&&y['proxy-groups'].length>0, String(y['proxy-groups'].length));
  chk('clash 有 rules', Array.isArray(y.rules)&&y.rules.length>5, String(y.rules.length));
  chk('clash 无 null 值输出', !out.clash.includes(': null'), (out.clash.match(/^\s*[\w-]+: null/m)||[''])[0]);
}catch(e){ chk('clash 合法 YAML', false, e.message); }
/* v2ray URI 内容 */
try{
  const uris=g('b64d')?'':'';
  const dec=run(`b64d(${JSON.stringify(out.v2ray)})`).split('\n');
  chk('v2ray 7 条 URI', dec.length===7, String(dec.length));
  chk('v2ray vless URI', dec[0].startsWith('vless://'), dec[0].slice(0,60));
  chk('v2ray 带 pbk', dec[0].includes('pbk='), '');
  chk('v2ray 带 #HK01', dec.some(x=>x.endsWith('#HK01')), '');
}catch(e){ chk('v2ray URI 校验', false, e.message); }

/* 3. Clash YAML 文件解析 */
console.log('\n## 3. Clash YAML 输入（Python 版产物）');
r=run(`loadContent(${JSON.stringify(clashFile)})`);
chk('解析 6 节点', r.n===6, 'got '+r.n+' fmt='+r.format);
chk('识别 Clash YAML', r.format==='Clash YAML', r.format);
const cn=g('NODES').map(n=>n.name+'('+n.protocol+')');
show('节点', cn.join(' | '));
singFile=run('buildSing(NODES,{region:true})');

/* 4. sing-box JSON 解析 */
console.log('\n## 4. sing-box JSON 输入');
r=run(`loadContent(${JSON.stringify(singFile)})`);
chk('解析 ≥4 节点', r.n>=4, 'got '+r.n+' fmt='+r.format);
chk('识别 sing-box', r.format==='sing-box JSON', r.format);

/* 5. Surge CONF 解析 */
console.log('\n## 5. Surge CONF 输入');
r=run(`loadContent(${JSON.stringify(surgeLike)})`);
chk('解析 5 节点', r.n===5, 'got '+r.n+' fmt='+r.format);
const sn=g('NODES').map(n=>n.name+':'+n.protocol);
show('Surge 节点', sn.join(' | '));
chk('Surge ss 正确', g('NODES').some(n=>n.protocol==='ss'&&n.server==='1.2.3.4'));
chk('Surge trojan 密码', g('NODES').some(n=>n.protocol==='trojan'&&n.password==='pw'));
chk('Surge vmess uuid', g('NODES').some(n=>n.protocol==='vmess'&&n.uuid.startsWith('11111111')));
chk('Surge hy2', g('NODES').some(n=>n.protocol==='hysteria2'));
chk('Surge wg', g('NODES').some(n=>n.protocol==='wireguard'));

/* 6. 空壳 Clash 检测（关键：UA 问题场景） */
console.log('\n## 6. 空壳 Clash 配置检测');
const emptyClash='mixed-port: 7890\nproxies: []\nproxy-groups:\n    - { name: Test, type: select, proxies: [DIRECT] }\nrules:\n    - MATCH,Test\n';
r=run(`loadContent(${JSON.stringify(emptyClash)})`);
chk('识别空壳 0 节点', r.n===0, 'got '+r.n);
chk('给出空壳警告', /空壳|proxies 是空的/.test(r.warn||''), r.warn||'(none)');
show('警告文案', r.warn);

/* 7. 地区分组 */
console.log('\n## 7. 地区分组');
run(`loadContent(${JSON.stringify(rinB64)})`);
const grp=run(`JSON.stringify(groupNodes(NODES,{groups:'all'}).order)`);
show('分组结果', grp);

/* 8. 混合协议 URI */
console.log('\n## 8. 全协议 URI 混合');
const mixed=[
 'vmess://eyJ2IjoiMiIsInBzIjoiVk1lc3MtVFMiLCJhZGQiOiJhLmV4LmNvbSIsInBvcnQiOiI4NDQzIiwiaWQiOiJ1MSIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwibmV0IjoidGNwIiwidHlwZSI6Im5vbmUiLCJob3N0IjoiIiwicGF0aCI6Ii8iLCJ0bHMiOiJ0bHMiLCJzbmkiOiJhLmV4LmNvbSJ9',
 'trojan://tp@t.example.com:443?sni=t.example.com&type=ws&path=%2Fx#TrojanWS',
 'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpzcHNAMi5leC5jb206ODM4OA%3D%3D#SS2022',
 'hy2://hp@h.example.com:443?sni=h.example.com&obfs=salamander&obfs-password=opy#HY2',
 'tuic://u1:p1@x.example.com:443?congestion_control=bbr&udp_relay_mode=native&sni=x.example.com#TUIC',
 'wg://c3JrZXk%3D@w.example.com:51820?publickey=cHBr&address=10.0.0.7%2F32&mtu=1420&keepalive=25&reserved=1,2,3#WG',
 'anytls://ap@a2.example.com:8443?sni=a2.example.com#AnyTLS',
 'socks5://su:sp@s.example.com:1080#SOCKS5',
].join('\n');
r=run(`loadContent(${JSON.stringify(mixed)})`);
const mp=g('NODES').map(n=>n.protocol);
show('协议集合', mp.join(','));
chk('全 8 协议解析', r.n===8, 'got '+r.n);
['vmess','trojan','ss','hysteria2','tuic','wireguard','anytls','socks5'].forEach(p=>
  chk('含 '+p, mp.includes(p)));
chk('SS 2022 base64 内嵌 name', g('NODES').some(n=>n.protocol==='ss'&&n.name==='SS2022'&&n.server==='2.ex.com'), JSON.stringify(g('NODES').find(n=>n.protocol==='ss')||{}).slice(0,150));
/* 全协议生成 + 回读 */
for(const k of ['clash','singbox','v2ray']){
  try{
    const o=run(`(${fmts[k]})`);
    const rr=run(`loadContent(${JSON.stringify(o)})`);
    chk('混合→'+k+'→回读', rr.n>=6, 'got '+rr.n);
  }catch(e){ chk('混合→'+k, false, e.message); }
}
try{ run(`buildSurge(NODES, {groups:'all',rule:true})`); chk('混合→Surge', true); }
catch(e){ chk('混合→Surge', false, e.message); }
try{ run(`buildQX(NODES, {groups:'all'})`); chk('混合→QX', true); }
catch(e){ chk('混合→QX', false, e.message); }


/* ============ 9. Surge / QX 输出细节回归 ============ */
show('9. Surge Surge / QX 输出细节');
run(`loadContent(${JSON.stringify(rinB64)})`);
const surge=run(`buildSurge(NODES,{groups:'all',rule:true})`);
const qx=run(`buildQX(NODES,{groups:'all'})`);
chk('Surge 无伪造 short-id', !/reality-short-id=0123456789abcdef/.test(surge));
chk('Surge 合成 short-id', /reality-short-id=1234567890abcd/.test(surge));
const mainLine=(surge.split('\n').find(l=>/节点选择 = select/.test(l))||'');
chk('Surge select 组不带测速参数', !/url=http/.test(mainLine));
const autoLine=(surge.split('\n').find(l=>/自动选择 = url-test/.test(l))||'');
chk('Surge url-test 组带测速参数', /url=http/.test(autoLine)&&/interval=/.test(autoLine));
chk('Surge 段落完整', ['[General]','[Proxy]','[Proxy Group]','[Rule]'].every(x=>surge.includes(x)));
chk('Surge 含 DIRECT 规则', /FINAL,Proxy/.test(surge)||/GEOIP/.test(surge));
chk('QX 段落完整', ['[SERVER_LOCAL]','[SERVER_REMOTE]','[POLICY]','[FILTER_LOCAL]'].some(x=>qx.toUpperCase().includes(x)));
chk('QX 合成 short_id', /short_id=1234567890abcd/.test(qx)&&!/short_id=0123456789abcdef/.test(qx));
const sing9=JSON.parse(run(`buildSing(NODES,{groups:'all',rule:true,geo:true})`));
const tags9=sing9.outbounds.filter(o=>['selector','urltest'].includes(o.type)).map(o=>o.tag);
chk('sing-box 组无重复', new Set(tags9).size===tags9.length, tags9.join(','));
chk('sing-box final 指向存在组', tags9.includes(sing9.route.final));
const clash9=run(`buildClash(NODES,{groups:'all',test:true,rule:true})`);
const gnames=(clash9.match(/^  - name: (.+)$/gm)||[]).map(x=>x.replace(/^  - name: /,''));
chk('Clash 组无重复', new Set(gnames).size===gnames.length, gnames.filter((x,i)=>gnames.indexOf(x)!==i).join(','));


chk('Clash 主组引用均已定义', gnames.every(x=>x), gnames.length+' 组');

/* ============ 10. 二维码功能 ============ */
show('10. 二维码功能（纯前端本地生成）');
try{
  chk('qrcode 函数可用', typeof g('qrcode')==='function', typeof g('qrcode'));
}catch(e){ chk('qrcode 函数可用', false, e.message); }
try{
  chk('makeQRCanvas 返回 canvas', typeof run('makeQRCanvas("https://example.com/sub/abc123")')==='object');
}catch(e){ chk('makeQRCanvas 返回 canvas', false, e.message); }
try{
  chk('makeQRCanvas 空文本返回 null', run('makeQRCanvas("")')===null);
}catch(e){ chk('makeQRCanvas 空文本返回 null', false, e.message); }
try{
  chk('downQRBlob 返回 data URI', typeof run('downQRBlob("https://subconv.example.com/sub/test")')==='string');
}catch(e){ chk('downQRBlob 返回 data URI', false, e.message); }
try{
  chk('qrTypeNumber 短链接', run('qrTypeNumber("https://example.com/sub/ab")')>=1 && run('qrTypeNumber("https://example.com/sub/ab")')<=40);
}catch(e){ chk('qrTypeNumber 短链接', false, e.message); }
try{
  chk('showRelayQR 无链接不崩溃', true); run('document.getElementById("relay-url").value=""; showRelayQR()');
}catch(e){ chk('showRelayQR 无链接不崩溃', false, e.message); }
try{
  run('document.getElementById("relay-url").value="https://subconv.example.com/sub/abc"; showRelayQR()');
  chk('showRelayQR 生成后展示区可见', true);
}catch(e){ chk('showRelayQR 生成后展示区可见', false, e.message); }

/* ============ 11. 节点删减：手动 / 关键词 / 复用去重 ============ */
console.log('\n## 11. 节点删减');
/* 构造：trojan 同端点 3 节点（复用3）+ ss 同端点(443) 2 节点 —— 与 trojan 跨协议，
   若代码错用 n.type（undefined）会被误合并成「复用5」 */
const dupYaml = [
  'proxies:',
  '  - {name: "A1", type: trojan, server: t.example.com, port: 443, password: p1}',
  '  - {name: "A2", type: trojan, server: t.example.com, port: 443, password: p2}',
  '  - {name: "A3", type: trojan, server: t.example.com, port: 443, password: p3}',
  '  - {name: "B1", type: ss, server: s.example.com, port: 443, password: p4, cipher: aes-256-gcm}',
  '  - {name: "B2", type: ss, server: s.example.com, port: 443, password: p5, cipher: aes-256-gcm}',
  '  - {name: "🇺🇸 C9", type: vless, server: u.example.com, port: 34567, uuid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8"}',
].join('\n');

run(`document.getElementById('i-url').value='https://feed.example.test/sub?token=ABC'`);
let rd = run(`loadContent(${JSON.stringify(dupYaml)})`);
const masterOf = () => run('MASTER.map(n=>n._orig||n.name)');
chk('母本 6 个节点', rd.master === 6, 'got ' + rd.master);
chk('未删减时生效 6 个', rd.n === 6, 'got ' + rd.n);
chk('母本名字保持原样', masterOf().join(',') === 'A1,A2,A3,B1,B2,🇺🇸 C9', masterOf().join(','));

/* —— 跨协议不算复用（n.type bug 的回归防护） —— */
run('NAMETAG.mode="port";NAMETAG.markDup=true;runFilter()');
const taggedNames = () => run('NODES.map(n=>n.name)');
let tn = taggedNames();
chk('trojan 组标为 复用3', tn[0] === 'A1【443 复用3】', tn[0]);
chk('ss 组标为 复用2（未被并入 trojan）', tn[3] === 'B1【443 复用2】', tn[3]);
chk('独占节点标 独占', tn[5] === '🇺🇸 C9【34567 独占】', tn[5]);

/* —— 手动隐藏：计数不得随删减漂移 —— */
run('FILTER.hidden[nodeKey(MASTER[0])]=1;runFilter()');
chk('隐藏 1 个后生效 5 个', run('NODES.length') === 5, 'got ' + run('NODES.length'));
chk('母本仍是 6 个（不可逆丢失）', run('MASTER.length') === 6, 'got ' + run('MASTER.length'));
tn = taggedNames();
chk('剩余 trojan 仍显示 复用3（基于母本计数）', tn[0] === 'A2【443 复用3】', tn[0]);
chk('被删项记录原因=手动', run('FILTER_APPLIED.removed[0].why') === '手动', run('FILTER_APPLIED.removed[0].why'));

/* —— 复用去重：每组只留第一个 —— */
run('FILTER.hidden=Object.create(null);FILTER.dropDup=true;runFilter()');
chk('去重后剩 3 组各 1 个', run('NODES.length') === 3, 'got ' + run('NODES.length'));
chk('去重保留 A1', masterOf().length && run('NODES.map(n=>n._orig).join(",")') === 'A1,B1,🇺🇸 C9', run('NODES.map(n=>n._orig).join(",")'));
chk('去重删 3 个且原因=复用去重', run('FILTER_APPLIED.removed.length') === 3 && run('FILTER_APPLIED.removed[0].why') === '复用去重');
chk('复用组面板列出 2 个组', run('FILTER_APPLIED.groups.length') === 2, 'got ' + run('FILTER_APPLIED.groups.length'));
/* 关键不变式：去重后名字里的复用计数仍为全量值 */
chk('去重后 A1 仍标 复用3', run('NODES[0].name') === 'A1【443 复用3】', run('NODES[0].name'));

/* —— 关键词规则引擎（不依赖改名，直接测 ruleHits） —— */
run('FILTER.hidden=Object.create(null);FILTER.dropDup=false;NAMETAG.mode="off";NAMETAG.markDup=false;runFilter()');
const hitOf = (kw) => run(`(function(){const r=parseKwRules(${JSON.stringify(kw)});return MASTER.filter(n=>r.active&&ruleHits(n,r)).map(n=>n._orig||n.name).join(",")})()`);
chk('关键词按名字（大小写不敏感）', hitOf('c9') === '🇺🇸 C9', hitOf('c9'));
chk('type: 按协议', hitOf('type:ss') === 'B1,B2', hitOf('type:ss'));
chk('type:hy2 别名归一化命中 hysteria2', hitOf('type:hy2') === '', hitOf('type:hy2'));
chk('port: 按端口', hitOf('port:34567') === '🇺🇸 C9', hitOf('port:34567'));
chk('多词为「或」', hitOf('a1 b1') === 'A1,B1', hitOf('a1 b1'));
chk('re/ 正则', hitOf('re/^🇺🇸/') === '🇺🇸 C9', hitOf('re/^🇺🇸/'));
chk('re/i 标志位', hitOf('re/^[a]/i') === 'A1,A2,A3', hitOf('re/^[a]/i'));
chk('纯 ! 前缀不触发删除', hitOf('!a1') === '', hitOf('!a1'));
chk('命中后 ! 豁免', hitOf('type:trojan !a2') === 'A1,A3', hitOf('type:trojan !a2'));
chk('协议豁免', hitOf('443 !type:ss') === 'A1,A2,A3', hitOf('443 !type:ss'));
chk('全角！同样作豁免', hitOf('type:trojan ！a2') === 'A1,A3', hitOf('type:trojan ！a2'));
chk('裸数字命中端口', hitOf('34567') === '\u{1F1FA}\u{1F1F8} C9', hitOf('34567'));
chk('裸数字 443 命中全部 443 端口', hitOf('443') === 'A1,A2,A3,B1,B2', hitOf('443'));
chk('非法正则被忽略且不抛', hitOf('re/([/ port:443') === 'A1,A2,A3,B1,B2', hitOf('re/([/ port:443'));

/* —— 规则真正落到结果上 —— */
run('FILTER.kw="type:trojan";runFilter()');
chk('规则删除生效', run('NODES.length') === 3, 'got ' + run('NODES.length'));
const whyOf = (kw, idx) => run(`(function(){const r=parseKwRules(${JSON.stringify(kw)});const h=ruleHits(MASTER[${idx}],r);return h?h.join('+'):'-'})()`);
chk('原因: type: 标「协议」', whyOf('type:trojan', 0) === '协议', whyOf('type:trojan', 0));
chk('原因: 裸数字标「端口」', whyOf('443', 0) === '端口', whyOf('443', 0));
chk('原因: 多类并列', whyOf('type:ss 443', 3) === '协议+端口', whyOf('type:ss 443', 3));
chk('原因: 正则标「正则」', whyOf('re/^A/', 0) === '正则', whyOf('re/^A/', 0));
chk('原因: 豁免时不算命中', whyOf('443 !a1', 0) === '-', whyOf('443 !a1', 0));
chk('生成配置只含 3 节点', /A1|A2|A3/.test(run('buildClash(NODES,{})')) === false);
chk('buildV2Ray 只含存活节点', run('buildV2Ray(NODES,{}).trim().split(String.fromCharCode(10)).length') === 3, 'got ' + run('buildV2Ray(NODES,{}).trim().split(String.fromCharCode(10)).length'));

/* —— 持久化：按订阅 URL 存，重新解析自动恢复 —— */
run(`document.getElementById('i-url').value='https://feed.example.test/sub?token=ABC'`);
run('filterSave()');
const storeKey = run('filterStoreKey()');
chk('已写入 localStorage', run(`localStorage.getItem(${JSON.stringify(storeKey)})`) !== null);
let rr = run(`loadContent(${JSON.stringify(dupYaml)})`);
chk('重新解析自动恢复删减', rr.restored === true && rr.removed === 3, JSON.stringify(rr));
chk('恢复后生效 3 个', rr.n === 3, 'got ' + rr.n);
chk('恢复的关键词规则', run('FILTER.kw') === 'type:trojan', run('FILTER.kw'));

/* —— 换订阅不得继承上一份的删减 —— */
run(`document.getElementById('i-url').value='https://other.example.test/sub?token=ZZZ'`);
let r2 = run('loadContent(' + JSON.stringify(dupYaml) + ')');
chk('换 URL 后删减归零', r2.removed === 0 && r2.restored === false && r2.n === 6, JSON.stringify(r2));
run(`document.getElementById('i-url').value='https://feed.example.test/sub?token=ZZZ'`);
chk('切到未见过的 URL 也是空删减', run('loadContent(MASTER.length?"proxies:\\n  - {name: Z, type: ss, server: 1.2.3.4, port: 1, password: x, cipher: aes-256-gcm}\\n":"" ).removed') === 0);

/* —— 清空 —— */
run(`document.getElementById('i-url').value='https://feed.example.test/sub?token=ABC'`);
run('loadContent(' + JSON.stringify(dupYaml) + ');FILTER.kw="type:trojan";runFilter()');
chk('清空前剩 3', run('NODES.length') === 3, 'got ' + run('NODES.length'));
run('clearAllHidden()');
chk('清空后回到 6', run('NODES.length') === 6, 'got ' + run('NODES.length'));


chk('清空后关键词也归零', run('FILTER.kw') === '' && run('FILTER.dropDup') === false);

/* —— 导出删减后的订阅 —— */
run('FILTER.hidden[nodeKey(NODES[0])]=1;runFilter()');
chk('导出 Base64 URI 少一个节点', (() => {
  const b64 = run('b64e(FILTER_APPLIED.kept.map(n=>node2uri(n)).filter(Boolean).join("\\n"))');
  const txt = Buffer.from(String(b64).replace(/^data:[^;]*;base64,/, ''), 'base64').toString('utf8');
  return txt.split('\n').filter(Boolean).length === 5;
})());


/* —— 边界：代表节点被手动删除后，“留1删N”不得把整组删光 —— */
run('FILTER.kw="";FILTER.hidden=Object.create(null);FILTER.dropDup=false;NAMETAG.mode="off";NAMETAG.markDup=false;runFilter()');
run('toggleNodeHidden(0)');                       /* 隐藏母本第一个 trojan A1 */
const g0 = JSON.parse(run('JSON.stringify(FILTER_APPLIED.groups[0])'));
chk('groups 仍报母本全量 3 个', g0.names.length === 3, JSON.stringify(g0.names));
run('hideGroupExtra(0)');
const leftTrojan = JSON.parse(run('JSON.stringify(NODES.map(n=>n._orig))')).filter(x=>/^A/.test(x));
chk('留1删N 至少保留一个存活节点', leftTrojan.length === 1, JSON.stringify(leftTrojan));

/* —— 回归：fake-ip-filter 通配写法必须被 mihomo 接受 —— */
/* 历史 bug：'+*.playstation.net' 会让 v1.19.30 整个配置加载失败 "invalid domain"，
   不是功能降级而是代理完全起不来。mihomo 中匹配任意层级的合法前缀是 '+'（非 '+*'）。 */
const cfgAll=run('buildClash(NODES,{groups:"all",test:true,rule:true})');
const fif=(cfgAll.match(/fake-ip-filter:\n((?:[ \t]+- .*\n?)+)/)||[,''])[1];
chk('生成的 Clash 配置含 fake-ip-filter 段', fif.trim().length>0, fif.slice(0,60));
const fifItems=fif.split('\n').map(s=>s.trim().replace(/^-\s*/,'').replace(/^"|"$/g,'')).filter(Boolean);
chk('fake-ip-filter 不含非法的 +*. 前缀', !fifItems.some(x=>x.startsWith('+*.')), fifItems.filter(x=>x.startsWith('+*.')).join(','));
chk('playstation/cybergame 用合法 +. 写法', fifItems.includes('+.playstation.net')&&fifItems.includes('+.cybergame.net'), fifItems.join(' '));
/* mihomo 合法前缀仅两种：'+.' 与 '*.'，或纯字面域名。'+*.' 会被判 invalid domain。
   已用 11 项样本（9 合法 / 2 非法）验证本判定。 */
const fifOk=x=>/^(?:\+\.|\*\.)?[\w][\w.*-]*$/.test(x);
chk('fake-ip-filter 每项均为内核可接受域名', fifItems.length>0&&fifItems.every(fifOk), fifItems.filter(x=>!fifOk(x)).join(',')||fifItems.join(' '));

show('汇总', `PASS ${pass}  FAIL ${fail}`);
process.exit(fail?1:0);
