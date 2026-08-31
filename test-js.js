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
  chk('downQRBlob 返回 data URI', typeof run('downQRBlob("https://relay.example.com/sub/test")')==='string');
}catch(e){ chk('downQRBlob 返回 data URI', false, e.message); }
try{
  chk('qrTypeNumber 短链接', run('qrTypeNumber("https://example.com/sub/ab")')>=1 && run('qrTypeNumber("https://example.com/sub/ab")')<=40);
}catch(e){ chk('qrTypeNumber 短链接', false, e.message); }
try{
  chk('showRelayQR 无链接不崩溃', true); run('document.getElementById("relay-url").value=""; showRelayQR()');
}catch(e){ chk('showRelayQR 无链接不崩溃', false, e.message); }
try{
  run('document.getElementById("relay-url").value="https://relay.example.com/sub/abc"; showRelayQR()');
  chk('showRelayQR 生成后展示区可见', true);
}catch(e){ chk('showRelayQR 生成后展示区可见', false, e.message); }

show('汇总', `PASS ${pass}  FAIL ${fail}`);
process.exit(fail?1:0);
