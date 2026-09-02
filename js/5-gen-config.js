/* ================= 地区识别 ================= */
const CN2CC={'香港':'HK','澳门':'MO','台湾':'TW','美国':'US','日本':'JP','韩国':'KR','新加坡':'SG',
'英国':'GB','德国':'DE','法国':'FR','加拿大':'CA','澳大利亚':'AU','荷兰':'NL','俄罗斯':'RU','泰国':'TH',
'越南':'VN','印度':'IN','巴西':'BR','土耳其':'TR','西班牙':'ES','意大利':'IT','菲律宾':'PH','马来西亚':'MY',
'阿联酋':'AE','沙特':'SA','卡塔尔':'QA','以色列':'IL','南非':'ZA','墨西哥':'MX','阿根廷':'AR','智利':'CL',
'波兰':'PL','瑞典':'SE','瑞士':'CH','奥地利':'AT','比利时':'BE','丹麦':'DK','芬兰':'FI','挪威':'NO',
'爱尔兰':'IE','葡萄牙':'PT','希腊':'GR','罗马尼亚':'RO','乌克兰':'UA','捷克':'CZ','匈牙利':'HU',
'新西兰':'NZ','巴基斯坦':'PK','孟加拉':'BD','哈萨克斯坦':'KZ','乌兹别克斯坦':'UZ','老挝':'LA',
'柬埔寨':'KH','蒙古':'MN','尼泊尔':'NP','斯里兰卡':'LK','格鲁吉亚':'GE','亚美尼亚':'AM','阿塞拜疆':'AZ',
'摩尔多瓦':'MD','塞尔维亚':'RS','克罗地亚':'HR','波黑':'BA','黑山':'ME','阿尔巴尼亚':'AL','北马其顿':'MK',
'保加利亚':'BG','爱沙尼亚':'EE','拉脱维亚':'LV','立陶宛':'LT','斯洛文尼亚':'SI','斯洛伐克':'SK',
'卢森堡':'LU','马耳他':'MT','塞浦路斯':'CY','冰岛':'IS','直布罗陀':'GI','留尼汪':'RE','波多黎各':'PR',
'关岛':'GU','多米尼加':'DO','哥斯达黎加':'CR','巴拿马':'PA','秘鲁':'PE','哥伦比亚':'CO','委内瑞拉':'VE',
'厄瓜多尔':'EC','玻利维亚':'BO','乌拉圭':'UY','巴拉圭':'PY','埃及':'EG','摩洛哥':'MA','突尼斯':'TN',
'阿尔及利亚':'DZ','利比亚':'LY','尼日利亚':'NG','肯尼亚':'KE','加纳':'GH','坦桑尼亚':'TZ','乌干达':'UG',
'安哥拉':'AO','莫桑比克':'MZ','津巴布韦':'ZW','赞比亚':'ZM','埃塞俄比亚':'ET','约旦':'JO','黎巴嫩':'LB',
'伊拉克':'IQ','伊朗':'IR','科威特':'KW','巴林':'BH','阿曼':'OM','土库曼斯坦':'TM','塔吉克斯坦':'TJ',
'吉尔吉斯斯坦':'KG','斐济':'FJ','巴布亚新几内亚':'PG','缅甸':'MM','文莱':'BN','印尼':'ID'};
const CITY={'hongkong':'HK','hk':'HK','tokyo':'JP','tyo':'JP','osaka':'JP','kuala lumpur':'MY','kualalumpur':'MY',
'london':'GB','uk':'GB','new york':'US','newyork':'US','los angeles':'US','losangeles':'US','san jose':'US',
'sanjose':'US','san francisco':'US','seattle':'US','chicago':'US','dallas':'US','atlanta':'US','miami':'US',
'boston':'US','washington':'US','us':'US','usa':'US','singapore':'SG','sg':'SG','korea':'KR','kr':'KR',
'seoul':'KR','frankfurt':'DE','germany':'DE','de':'DE','amsterdam':'NL','netherlands':'NL','nl':'NL',
'paris':'FR','france':'FR','toronto':'CA','canada':'CA','ca':'CA','vancouver':'CA','montreal':'CA',
'sydney':'AU','melbourne':'AU','australia':'AU','au':'AU','bangkok':'TH','hanoi':'VN','hochiminh':'VN',
'vietnam':'VN','mumbai':'IN','india':'IN','delhi':'IN','moscow':'RU','russia':'RU','istanbul':'TR',
'turkey':'TR','madrid':'ES','spain':'ES','rome':'IT','milan':'IT','italy':'IT','manila':'PH','jakarta':'ID',
'indonesia':'ID','dubai':'AE','uae':'AE','riyadh':'SA','saudi':'SA','tel aviv':'IL','israel':'IL',
'sao paulo':'BR','saopaulo':'BR','brazil':'BR','buenos aires':'AR','buenosaires':'AR','argentina':'AR',
'santiago':'CL','chile':'CL','warsaw':'PL','poland':'PL','stockholm':'SE','sweden':'SE','zurich':'CH',
'switzerland':'CH','vienna':'AT','brussels':'BE','belgium':'BE','copenhagen':'DK','helsinki':'FI',
'oslo':'NO','dublin':'IE','lisbon':'PT','athens':'GR','bucharest':'RO','kyiv':'UA','prague':'CZ',
'budapest':'HU','auckland':'NZ','wellington':'NZ','new zealand':'NZ','karachi':'PK','dhaka':'BD',
'astana':'KZ','tashkent':'UZ','ulaanbaatar':'MN','mongolia':'MN','manama':'BH','muscat':'OM','doha':'QA',
'kathmandu':'NP','colombo':'LK','tbilisi':'GE','yerevan':'AM','baku':'AZ','chisinau':'MD','belgrade':'RS',
'zagreb':'HR','sarajevo':'BA','podgorica':'ME','skopje':'MK','tirana':'AL','sofia':'BG','tallinn':'EE',
'riga':'LV','vilnius':'LT','ljubljana':'SI','bratislava':'SK','luxembourg':'LU','valletta':'MT',
'nicosia':'CY','reykjavik':'IS','casablanca':'MA','cairo':'EG','lagos':'NG','nairobi':'KE','accra':'GH',
'kigali':'RW','maputo':'MZ','harare':'ZW','addis ababa':'ET','amman':'JO','beirut':'LB','baghdad':'IQ',
'tehran':'IR','turkmenbashi':'TM','dushanbe':'TJ','bishkek':'KG','vientiane':'LA','phnom penh':'KH',
'yangon':'MM','bandar seri':'BN','suva':'FJ','port moresby':'PG','havana':'CU','limaa':'PE','lima':'PE',
'bogota':'CO','caracas':'VE','quito':'EC','lapaz':'BO','la paz':'BO','montevideo':'UY','asuncion':'PY',
'san jose':'CR','panama':'PA','santo domingo':'DO','guatemala':'GT','tehuacan':'MX','mexico':'MX',
'san juan':'PR','talinn':'EE','krakow':'PL','gdansk':'PL','gothenburg':'SE','malmo':'SE','basel':'CH',
'geneva':'CH','hamburg':'DE','berlin':'DE','munich':'DE','dusseldorf':'DE','frankfort':'DE','lyon':'FR',
'marseille':'FR','bordeaux':'FR','milan':'IT','naples':'IT','barcelona':'ES','valencia':'ES','porto':'PT',
'manchester':'GB','birmingham':'GB','edinburgh':'GB','cardiff':'GB','rotterdam':'NL','the hague':'NL',
'antwerp':'BE','aarhus':'DK','turku':'FI','tartu':'EE','kaunas':'LT','gdansk':'PL','cluj':'RO',
'valencia':'ES','sevilla':'ES','bilbao':'ES','newcastle':'GB','bristol':'GB','glasgow':'GB','perth':'AU',
'brisbane':'AU','adelaide':'AU','canberra':'AU','darwin':'AU','hamilton':'NZ','christchurch':'NZ',
'taichung':'TW','kaohsiung':'TW','taipei':'TW','taoyuan':'TW','shatin':'HK','kowloon':'HK','abou dhabi':'AE',
'abu dhabi':'AE','sharjah':'AE','jeddah':'SA','khobar':'SA','petaling':'MY','penang':'MY','cochin':'IN',
'hyderabad':'IN','bangalore':'IN','chennai':'IN','kolkata':'IN','pune':'IN','lahore':'PK','islamabad':'PK',
'Rawalpindi':'PK','chittagong':'BD','colombo':'LK','fukuoka':'JP','nagoya':'JP','sapporo':'JP','kansai':'JP',
'kyoto':'JP','yokohama':'JP','incheon':'KR','busan':'KR','daegu':'KR','changhua':'TW','taichung':'TW'};
function detectRegion(n){
  // _orig：节点名标注（出口地址/复用）会改写 name，分组必须以原名为准
  const nm=String(n._orig||n.name||'');
  const raw=nm+' '+String(n.server||'');
  let low=raw.toLowerCase().replace(/[\s\-_·．.]/g,'');
  // 显式两位国家码：HK01 / SG-01 / us02
  let m=/(?:^|[^a-z])([a-z]{2})[-_ ]?\d{1,2}(?:[^a-z]|$)/i.exec(nm);
  if(m){ const cc=m[1].toUpperCase(); if(cc!=='ID'&&cc!=='IP'&&cc!=='OS'&&cc!=='TV'&&cc!=='PC'&&cc!=='TL'&&cc!=='LN') return {cc}; }
  m=/(?:^|[^a-z])([a-z]{2})(?=[0-9]{1,2}\b|\b)/i.exec(nm);
  // 中文国家/地区名
  for(const [zh,cc] of Object.entries(CN2CC)){ if(raw.includes(zh)) return {cc, zh}; }
  // 城市/英文国家名
  for(const [city,cc] of Object.entries(CITY)){ if(low.includes(city.replace(/[\s\-_]/g,''))) return {cc}; }
  // emoji 国旗 → 两位码
  m=/([\uD83C-\uDDFF]{2})/.exec(nm);
  if(m){ try{ const cc=Array.from(m[0]).map(ch=>String.fromCharCode(0x41+ch.codePointAt(0)-0x1F1E6)).join('');
    if(/^[A-Z]{2}$/.test(cc)) return {cc}; }catch(e){} }
  return {cc:'XX'};
}
function regionLabel(n){
  const r=detectRegion(n);
  const zh=CC2ZH[r.cc];
  return zh?zh:(r.cc==='XX'?'🌍 其他':r.cc+' 节点');
}
const CC2ZH={HK:'🇭🇰 香港',MO:'🇲🇴 澳门',TW:'🇨🇳 台湾',US:'🇺🇸 美国',JP:'🇯🇵 日本',KR:'🇰🇷 韩国',
SG:'🇸🇬 新加坡',GB:'🇬🇧 英国',DE:'🇩🇪 德国',FR:'🇫🇷 法国',CA:'🇨🇦 加拿大',AU:'🇦🇺 澳大利亚',
NL:'🇳🇱 荷兰',RU:'🇷🇺 俄罗斯',TH:'🇹🇭 泰国',VN:'🇻🇳 越南',IN:'🇮🇳 印度',BR:'🇧🇷 巴西',
TR:'🇹🇷 土耳其',ES:'🇪🇸 西班牙',IT:'🇮🇹 意大利',PH:'🇵🇭 菲律宾',MY:'🇲🇾 马来西亚',
AE:'🇦🇪 阿联酋',SA:'🇸🇦 沙特',QA:'🇶🇦 卡塔尔',IL:'🇮🇱 以色列',ZA:'🇿🇦 南非',MX:'🇲🇽 墨西哥',
AR:'🇦🇷 阿根廷',CL:'🇨🇱 智利',PL:'🇵🇱 波兰',SE:'🇸🇪 瑞典',CH:'🇨🇭 瑞士',AT:'🇦🇹 奥地利',
BE:'🇧🇪 比利时',DK:'🇩🇰 丹麦',FI:'🇫🇮 芬兰',NO:'🇳🇴 挪威',IE:'🇮🇪 爱尔兰',PT:'🇵🇹 葡萄牙',
GR:'🇬🇷 希腊',RO:'🇷🇴 罗马尼亚',UA:'🇺🇦 乌克兰',CZ:'🇨🇿 捷克',HU:'🇭🇺 匈牙利',NZ:'🇳🇿 新西兰',
PK:'🇵🇰 巴基斯坦',BD:'🇧🇩 孟加拉国',KZ:'🇰🇿 哈萨克斯坦',UZ:'🇺🇿 乌兹别克斯坦',LA:'🇱🇦 老挝',
KH:'🇰🇭 柬埔寨',MN:'🇲🇳 蒙古',NP:'🇳🇵 尼泊尔',LK:'🇱🇰 斯里兰卡',GE:'🇬🇪 格鲁吉亚',
AM:'🇦🇲 亚美尼亚',AZ:'🇦🇿 阿塞拜疆',MD:'🇲🇩 摩尔多瓦',RS:'🇷🇸 塞尔维亚',HR:'🇭🇷 克罗地亚',
BA:'🇧🇦 波黑',ME:'🇲🇪 黑山',AL:'🇦🇱 阿尔巴尼亚',MK:'🇲🇰 北马其顿',BG:'🇧🇬 保加利亚',
EE:'🇪🇪 爱沙尼亚',LV:'🇱🇻 拉脱维亚',LT:'🇱🇹 立陶宛',SI:'🇸🇮 斯洛文尼亚',SK:'🇸🇰 斯洛伐克',
LU:'🇱🇺 卢森堡',MT:'🇲🇹 马耳他',CY:'🇨🇾 塞浦路斯',IS:'🇮🇸 冰岛',GI:'🇬🇮 直布罗陀',
RE:'🇷🇪 留尼汪',PR:'🇵🇷 波多黎各',GU:'🇬🇺 关岛',DO:'🇩🇴 多米尼加',CR:'🇨🇷 哥斯达黎加',
PA:'🇵🇦 巴拿马',PE:'🇵🇪 秘鲁',CO:'🇨🇴 哥伦比亚',VE:'🇻🇪 委内瑞拉',EC:'🇪🇨 厄瓜多尔',
BO:'🇧🇴 玻利维亚',UY:'🇺🇾 乌拉圭',PY:'🇵🇾 巴拉圭',EG:'🇪🇬 埃及',MA:'🇲🇦 摩洛哥',
TN:'🇹🇳 突尼斯',DZ:'🇩🇿 阿尔及利亚',LY:'🇱🇾 利比亚',NG:'🇳🇬 尼日利亚',KE:'🇰🇪 肯尼亚',
GH:'🇬🇭 加纳',TZ:'🇹🇿 坦桑尼亚',UG:'🇺🇬 乌干达',AO:'🇦🇴 安哥拉',MZ:'🇲🇿 莫桑比克',
ZW:'🇿🇼 津巴布韦',ZM:'🇿🇲 赞比亚',ET:'🇪🇹 埃塞俄比亚',JO:'🇯🇴 约旦',LB:'🇱🇧 黎巴嫩',
IQ:'🇮🇶 伊拉克',IR:'🇮🇷 伊朗',KW:'🇰🇼 科威特',BH:'🇧🇭 巴林',OM:'🇴🇲 阿曼',
TM:'🇹🇲 土库曼斯坦',TJ:'🇹🇯 塔吉克斯坦',KG:'🇰🇬 吉尔吉斯斯坦',FJ:'🇫🇯 斐济',
PG:'🇵🇬 巴布亚新几内亚',MM:'🇲🇲 缅甸',BN:'🇧🇳 文莱',ID:'🇮🇩 印度尼西亚',CU:'🇨🇺 古巴',
GT:'🇬🇹 危地马拉',HN:'🇭🇳 洪都拉斯',SV:'🇸🇻 萨尔瓦多',NI:'🇳🇮 尼加拉瓜'};

/* ================= 分组 ================= */
function uniq(a){ const s=new Set(); return a.filter(x=>s.has(x)?false:(s.add(x),true)); }
/* 返回统一的分组模型：
   { groups:[{name,type,members,isNode}], order:[组名...], sel:[可作为策略出口的组名] } */
function groupNodes(nodes,opts){
  opts=opts||{};
  const names=nodes.map(n=>n.name);
  if(!nodes.length) return {groups:[], order:[], sel:[]};
  if(opts.groups===false||opts.groups==='none')
    return {groups:[], order:[], sel:names.slice(), all:names};

  const MODE=opts.groups==='all'?'all':(opts.groups==='region'?'region':'auto');
  const byRegion={};
  for(const n of nodes){ const rg=regionLabel(n); (byRegion[rg]=byRegion[rg]||[]).push(n.name); }
  const regions=Object.keys(byRegion);
  const mk=rg=>({name:rg, type:byRegion[rg].length>=2?'url-test':'select', members:byRegion[rg].slice()});
  let groups=[];

  if(MODE==='all'){
    const autoAll ={name:'🐠 自动选择', type:'url-test', members:names.slice()};
    const fbAll   ={name:'🎯 故障转移', type:'fallback', members:names.slice()};
    const manual  ={name:'🔰 手动选择', type:'select',   members:names.slice()};
    groups=[{name:'🚀 节点选择', type:'select',
             members:[autoAll.name, fbAll.name].concat(regions).concat(regions.length?[manual.name]:[])},
            autoAll, fbAll].concat(regions.map(mk)).concat(regions.length?[manual]:[]);
  } else if(MODE==='region'){
    groups=[{name:'🚀 节点选择', type:'select', members:regions.slice()}].concat(regions.map(mk));
  } else {
    if(regions.length>1){
      groups=[{name:'🚀 节点选择', type:'select', members:regions.slice()}].concat(regions.map(mk));
    } else {
      groups=[{name:'🚀 节点选择', type:names.length>=2?'url-test':'select', members:names.slice()}];
    }
    // 开启测速且尚无自动测速组时，补一个全节点 url-test
    if(opts.test&&!groups.some(g=>g.type==='url-test')){
      groups=[{name:'🚀 节点选择', type:'select', members:['♻️ 自动选择'].concat(names.slice())},
              {name:'♻️ 自动选择', type:'url-test', members:names.slice()}];
    }
  }
  const seen=new Set();
  const out=groups.filter(g=>g.name&&!seen.has(g.name)&&(seen.add(g.name),true));
  return {groups:out, order:out.map(g=>g.name), sel:out.map(g=>g.name), all:names};
}
const AUTO_GROUP={url:'http://www.gstatic.com/generate_204',interval:300,tolerance:50,lazy:true};
/* 展开：把 group 模型转成 [{name, type, members(最终成员名，含组名或节点名)}] */
function expandGroups(nodes,grp){
  const names=new Set(nodes.map(n=>n.name));
  const gnames=new Set(grp.groups.map(g=>g.name));
  return grp.groups.map(g=>({name:g.name,type:g.type,
    members:g.members.filter(m=>names.has(m)||gnames.has(m)&&m!==g.name)}));
}

/* ================= Clash 完整配置 ================= */
function buildClash(list,opt){
  opt=opt||{};
  const names=list.map(n=>n.name);
  const g=groupNodes(list,opt);
  const proxies=list.map(node2clash);
  const pg=[];
  expandGroups(list,g).forEach(gr=>{
    const members=gr.members.slice();
    const o={name:gr.name,type:gr.type,proxies:uniq(members.concat(['DIRECT']))};
    if(/url-test|fallback|load-balance/.test(gr.type)) Object.assign(o,AUTO_GROUP);
    pg.push(o);
  });
  const hasStr=str=>pg.some(x=>x.name===str);
  const policy=[];
  if(opt.rule){
    const P=hasStr('🚀 节点选择')?'🚀 节点选择':(pg[0]?pg[0].name:'DIRECT');
    const mediaG=hasStr('🌍 国外媒体')?'🌍 国外媒体':P;
    [['GEOSITE,youtube',mediaG],['GEOSITE,netflix',mediaG],['GEOSITE,twitter',P],
     ['GEOSITE,openai',P],['GEOSITE,anthropic',P],['GEOSITE,google',P],['GEOSITE,github',P],
     ['GEOSITE,geolocation-!cn',P],['GEOSITE,category-ads-all','REJECT'],
     ['GEOSITE,private','DIRECT'],['GEOSITE,geolocation-cn','DIRECT'],
     ['GEOIP,CN','DIRECT,no-resolve'],['GEOIP,LAN','DIRECT,no-resolve'],
     ['GEOIP,PRIVATE','DIRECT,no-resolve']].forEach(([r,t])=>policy.push(r+','+t));
  }
  policy.push('MATCH,'+(hasStr('🐟 漏网之鱼')?'🐟 漏网之鱼':(pg[0]?pg[0].name:'DIRECT')));
  const cfg=clean({
    'mixed-port':7890, 'allow-lan':false, 'bind-address':'*', mode:opt.rule?'rule':'global',
    'log-level':'info', ipv6:false, 'unified-delay':true, 'tcp-concurrent':true,
    'find-process-mode':'strict', 'external-controller':'127.0.0.1:9090',
    'external-controller-cors':{'allow-private-network':true, 'allow-origins':['*']},
    profile:{'store-selected':true,'store-fake-ip':true},
    'geodata-mode':true, 'geo-auto-update':true, 'geo-update-interval':24,
    'geox-url':{'geoip':'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat','geosite':'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat'},
    dns:opt.dns===false?undefined:CLASH_DNS,
    proxies, 'proxy-groups':pg, rules:policy
  });
  return dumpYAML(cfg);
}
const CLASH_DNS={
  enable:true, ipv6:false, 'enhanced-mode':'fake-ip', 'fake-ip-range':'198.18.0.1/16',
  'default-nameserver':['223.5.5.5','119.29.29.29'],
  nameserver:['https://doh.pub/dns-query','https://dns.alidns.com/dns-query'],
  fallback:['https://dns.cloudflare.com/dns-query','https://dns.google/dns-query'],
  'fallback-filter':{geoip:true,'geoip-code':'CN',domain:['+.google.com','+.githubusercontent.com']},
  'fake-ip-filter':['*.lan','*.local','*.localhost','localhost.ptlogin2.qq.com','+.stun.*.*',
    '*.msftconnecttest.com','*.msftncsi.com','xbox.*.*.microsoft.com','+.playstation.net','+.cybergame.net']
};

/* ================= sing-box 完整配置 ================= */
function buildSing(list,opt){
  opt=opt||{};
  const g=groupNodes(list,opt);
  const names=list.map(n=>n.name);
  const grps=expandGroups(list,g);
  const mainTag=grps.length?grps[0].name:'direct';
  const obs=[
    {type:'mixed',tag:'mixed-in',listen:'127.0.0.1',listen_port:2080,sniff:true},
    {type:'tun',tag:'tun-in',interface_name:'sing-tun',address:['172.19.0.1/30','fd00:dead:beef::1/64'],
      auto_route:true,strict_route:false,sniff:true,platform:{http_proxy:{enabled:false}}}
  ];
  const outs=[];
  if(grps.length){
    grps.forEach((gr,i)=>{
      const members=gr.members.slice();
      if(!members.length) return;
      if(gr.type==='url-test') outs.push(Object.assign({type:'urltest',tag:gr.name,outbounds:members},AUTO_GROUP_SING));
      else if(gr.type==='fallback') outs.push({type:'urltest',tag:gr.name,outbounds:members,interrupt_exists_connection:true,url:AUTO_GROUP_SING.url,interval:AUTO_GROUP_SING.interval});
      else if(gr.type==='load-balance') outs.push(Object.assign({type:'urltest',tag:gr.name,outbounds:members,interrupt_exists_connection:true},AUTO_GROUP_SING));
      else outs.push({type:'selector',tag:gr.name,outbounds:gr.name===grps[0].name?uniq(members.concat(['direct'])):members,default:members[0]});
    });
  } else {
    outs.push({type:'selector',tag:'节点选择',outbounds:names.slice(),default:names[0]});
  }
  outs.push({type:'direct',tag:'direct'});
  outs.push({type:'block',tag:'block'});
  outs.push({type:'dns',tag:'dns-out'});
  list.forEach(n=>{ const o=node2sing(n); if(o) outs.push(o); });
  const rules=[
    {action:'sniff'},
    {action:'route',outbound:'dns-out',protocol:['dns']},
    {action:'route',outbound:'direct',rule_set:'private'},
    {action:'route',outbound:'direct',clash_mode:'Direct'},
    {action:'route',outbound:mainTag,clash_mode:'Proxy'},
    {action:'route',outbound:'block',protocol:['quic']},
  ];
  if(opt.rule&&opt.geo){
    rules.push({action:'route',outbound:'direct',rule_set:'geoip-cn'});
    rules.push({action:'route',outbound:'direct',rule_set:'geosite-cn'});
  }
  rules.push({action:'route',outbound:mainTag});
  const rs=[{tag:'private',type:'remote',format:'binary',
    url:'https://testingcf.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip_private.srs',download_detour:'direct'}];
  if(opt.rule&&opt.geo){
    rs.push({tag:'geoip-cn',type:'remote',format:'binary',url:'https://testingcf.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip_cn.srs',download_detour:'direct'});
    rs.push({tag:'geosite-cn',type:'remote',format:'binary',url:'https://testingcf.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite_category-cn.srs',download_detour:'direct'});
  }
  const cfg=clean({
    log:{level:'info',timestamp:true},
    dns:{
      servers:[
        {tag:'remote',address:'https://dns.cloudflare.com/dns-query',detour:mainTag,strategy:'prefer_ipv4'},
        {tag:'local',address:'https://dns.alidns.com/dns-query',detour:'direct',strategy:'prefer_ipv4'},
        {tag:'localhost',address:'local',detour:'direct'}
      ],
      rules:[
        {action:'route',server:'local',clash_mode:'Direct'},
        {action:'route',server:'local',outbound:'direct'},
        {action:'route',server:'local',query_type:['HTTPS']}
      ],
      final:'remote', independent_cache:true, disable_cache:false
    },
    inbounds:obs, outbounds:outs,
    route:{rules, final:mainTag, auto_detect_interface:true, max_open_files:10240,
      sniff:{override_destination:true}, rule_set:rs},
    experimental:{cache:{enabled:true},
      clash_api:{external_controller:'127.0.0.1:9097',external_ui:'ui',
        external_ui_download_url:'https://github.com/zephyruso/zashboard/releases/latest/download/dist.zip',
        mode:'rule'}}
  });
  return JSON.stringify(cfg,null,2);
}
const AUTO_GROUP_SING={url:'http://www.gstatic.com/generate_204',interval:'3m'};

/* ================= Surge ================= */
function buildSurge(list,opt){
  opt=opt||{};
  const g=groupNodes(list,{...opt,groups:opt.groups||'region'});
  const L=[], names=list.map(n=>n.name);
  L.push('[General]');
  L.push('skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, 172.25.0.0/16, 127.0.0.1, localhost, *.local, *.crashlytics.com');
  L.push('allow-wifi-access = false'); L.push('ipv6 = false');
  L.push('enhanced-mode-by-rule = false'); L.push('show-error-page-for-reject = true');
  L.push('all-hybrid = false'); L.push('http-api = 1');
  L.push('test-timeout = 5'); L.push('internet-test-url = http://cp.baidu.com/');
  L.push('proxy-test-url = http://www.gstatic.com/generate_204');
  L.push('hijack-dns = *:53'); L.push('dns-server = 223.5.5.5, 119.29.29.29, system');
  L.push('skip-proxy = 127.0.0.1');
  L.push('');
  L.push('[Proxy]');
  list.forEach(n=>{ const s=node2surge(n); if(s) L.push(n.name+' = '+s); });
  L.push('');
  L.push('[Proxy Group]');
  expandGroups(list,g).forEach(gr=>{
    const t=gr.type==='url-test'?'url-test':(gr.type==='fallback'?'fallback':'select');
    const body=gr.members.join(', ');
    if(t==='select') L.push(`${gr.name} = select, ${body}`);
    else L.push(`${gr.name} = ${t}, ${body}, url=http://www.gstatic.com/generate_204, interval=300, tolerance=50${t==='fallback'?', timeout=5':''}`);
  });
  const mainName=g.groups.length?g.groups[0].name:'DIRECT';
  L.push(`🐟 漏网之鱼 = select, ${mainName}, DIRECT, REJECT-DROP`);
  L.push('');
  L.push('[URL Rewrite]'); L.push('');
  L.push('[Header Rewrite]'); L.push('');
  L.push('[MITM]'); L.push('skip-certificate-check = 1'); L.push('hostname = *.googlevideo.com'); L.push('');
  L.push('[Rule]');
  L.push('AND,((PROTOCOL,UDP),(DST-PORT,443)),REJECT-NO-DROP');
  L.push('COUNTRY,US,🇺🇸 美国');
  L.push('GEOSITE,CATEGORY_ADS_ALL,REJECT-DROP');
  L.push('GEOSITE,PRIVATE,DIRECT');
  L.push('GEOSITE,GEOSITE-CN,DIRECT');
  L.push('GEOIP,CN,DIRECT');
  L.push(`FINAL,🐟 漏网之鱼`);
  return L.join('\n')+'\n';
}
function node2surge(n){
  const t=(o)=>Object.entries(o).filter(([k,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>k+'='+v).join(', ');
  switch(n.protocol){
    case 'vmess':
      return `${n.server}, ${n.port}, vmess, username=${n.uuid}, alter-id=${n.alterId||0}, ${t({'vmess-mode':n.cipher||'auto','over-tls':n.security==='tls'||n.security==='reality'?'true':undefined,'tls-verification':n.insecure?'false':undefined,'tls-hosting':n.sni,'ws':n.network==='ws'?'true':undefined,'ws-path':n.network==='ws'?(n.path||'/'):undefined,'obfs-host':n.network==='ws'?n.host:undefined,'tcp-obsolete-header':n.network==='grpc'?'true':undefined,tag:n.name})}`;
    case 'vless':
      return `${n.server}, ${n.port}, vless, username=${n.uuid}, ${t({tls:n.security==='tls'||n.security==='reality'?'true':undefined,'reality':n.security==='reality'?'true':undefined,'reality-public-key':n.reality?n.reality.public_key:undefined,'reality-short-id':n.reality&&n.reality.short_id?n.reality.short_id:undefined,'tls-hosting':n.sni||n.server,'flow':n.flow,ws:n.network==='ws'?'true':undefined,'ws-path':n.network==='ws'?(n.path||'/'):undefined,'ws-host':n.network==='ws'?n.host:undefined,tag:n.name})}`;
    case 'trojan':
      return `${n.server}, ${n.port}, password=${n.password}, ${t({'over-tls':'true',sni:n.sni||n.server,alpn:(n.alpn||['http/1.1']).join(','),'tls-verification':n.insecure?'false':undefined,'reality':n.security==='reality'?'true':undefined,'reality-public-key':n.reality?n.reality.public_key:undefined,ws:n.network==='ws'?'true':undefined,'ws-path':n.network==='ws'?(n.path||'/'):undefined,tag:n.name})}`;
    case 'ss':
      return `${n.server}, ${n.port}, method=${n.method||n.cipher||'chacha20-ietf-poly1305'}, password=${n.password}, ${t({uot:'true','obfs-host':n.plugin?undefined:undefined,tag:n.name})}`;
    case 'hysteria2':
      return `${n.server}, ${n.port}, hysteria2, password=${n.password}, ${t({sni:n.sni||n.server,'skip-cert-verify':n.insecure?'true':undefined,obfs:n.obfsType,'obfs-param':n.obfsPassword,tag:n.name})}`;
    case 'tuic':
      return `${n.server}, ${n.port}, tuic-v5, token=${n.uuid}, password=${n.password}, ${t({sni:n.sni||n.server,'skip-cert-verify':n.insecure?'true':undefined,'congestion-controller':n.congestionControl||'cubic',tag:n.name})}`;
    case 'wireguard':
      return `${n.server}, ${n.port}, ${t({'public-key':n.peerPublicKey,'private-key':n.privateKey,'pre-shared-key':n.preSharedKey,ip:(n.localAddress||[]).map(x=>x.split('/')[0]).join('.'),mtu:n.mtu||1428,tag:n.name})}`;
    case 'anytls':
      return `${n.server}, ${n.port}, password=${n.password}, ${t({'over-tls':'true',sni:n.sni||n.server,'tls-verification':n.insecure?'false':undefined,tag:n.name})}`;
    case 'socks5': case 'http':
      return `${n.server}, ${n.port}${n.username?', username='+n.username+', password='+n.password:''}, ${t({tag:n.name})}`;
  }
  return null;
}

/* ================= Quantumult X ================= */
function buildQX(list,opt){
  opt=opt||{};
  const g=groupNodes(list,{...opt,groups:opt.groups||'region'});
  const L=['[GENERAL]','filter_local = file:///etc/quantumult-x/filter.conf','dns_server = 114.114.114.114','dns_server = 223.5.5.5','fallback_dns_server = 1.1.1.1, 8.8.8.8','dns_exclusion_list = *.cmpassport.com, *.jegotrip.com.cn, *.local','']
    , names=list.map(n=>n.name);
  L.push('[SERVER_REMOTE]'); list.forEach(n=>{const s=node2qx(n); if(s) L.push(s);}); L.push('');
  L.push('[POLICY]');
  expandGroups(list,g).forEach(gr=>{
    const t=gr.type==='url-test'?'url-speed':(gr.type==='fallback'?'fall-speed':'static');
    L.push(`${gr.name} = ${t}, ${gr.members.join(', ')}, expire-time=600, speed-timeout=5, default-policy=direct`);
  });
  L.push('🐟 漏网之鱼 = static, 🚀 节点选择, direct, reject'); L.push('');
  L.push('[FILTER_LOCAL]');
  L.push('final, 🐟 漏网之鱼'); L.push('');
  L.push('[URL_REWRITE]'); L.push('');
  L.push('[HEADER]'); L.push('');
  return L.join('\n')+'\n';
}
function node2qx(n){
  const t=(o)=>Object.entries(o).filter(([k,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>k+'='+v).join(', ');
  switch(n.protocol){
    case 'vmess': return `${n.server}:${n.port}, vmess=${n.uuid}, ${t({obfs:'websocket', 'obfs-host':n.host||undefined,'obfs-uri':n.path||undefined, over_tls:n.security==='tls'?'1':undefined, tag:n.name})}`;
    case 'vless': return `${n.server}:${n.port}, vless=${n.uuid}, ${t({over_tls:n.security!=='none'?'1':undefined, peer:n.sni||n.server, vless_flow:n.flow||undefined, reality:n.security==='reality'?'1':undefined, public_key:n.reality?n.reality.public_key:undefined, short_id:n.reality&&n.reality.short_id?n.reality.short_id:undefined, obfs:n.network==='ws'?'websocket':undefined, tag:n.name})}`;
    case 'trojan': return `${n.server}:${n.port}, password=${n.password}, ${t({over_tls:'1', peer:n.sni||n.server, tag:n.name})}`;
    case 'ss': return `${n.server}:${n.port}, method=${n.method||n.cipher||'chacha20-ietf-poly1305'}, password=${n.password}, ${t({obfs:n.plugin?'websocket':undefined,'obfs-host':undefined, tag:n.name})}`;
    case 'hysteria2': return `${n.server}:${n.port}, password=${n.password}, ${t({over_tls:'1', peer:n.sni||n.server, obfs:n.obfsType||undefined, 'obfs-param':n.obfsPassword||undefined, tag:n.name})}`;
    case 'tuic': return `${n.server}:${n.port}, password=${n.password}, ${t({uuid:n.uuid||undefined, peer:n.sni||n.server, congestion_controller:n.congestionControl||'cubic', tag:n.name})}`;
    case 'wireguard': return `${n.server}:${n.port}, method=wireguard, ${t({priv_key:n.privateKey, pubkey:n.peerPublicKey, pre_shared_key:n.preSharedKey, gw:(n.localAddress||[]).map(x=>x.split('/')[0]).join('.')||undefined, tag:n.name})}`;
    case 'socks5': return `${n.server}:${n.port}, method=socks5${n.username?', user='+n.username+', password='+n.password:''}, tag=${n.name}`;
    case 'http': return `${n.server}:${n.port}, method=http${n.username?', user='+n.username+', password='+n.password:''}, tag=${n.name}`;
  }
  return null;
}

/* ================= v2ray / SSR 纯 URI 列表 ================= */
function buildV2Ray(list,opt){
  return list.map(node2uri).filter(Boolean).join('\n');
}
