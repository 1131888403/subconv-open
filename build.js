const fs=require('fs');
const path=require('path');
const dir=__dirname;
const order=['1-util.js','2-parse-uri.js','3b-surge.js','7-nametag.js','3-parse-format.js','4-gen-basic.js','5-gen-config.js','6-ui.js','8-qrcode.js'];
// vendor/qrcode.js：MIT 许可的 qrcode-generator（Kazuhiko Arase），前置内联为全局函数 qrcode
let js='/* == QR library: qrcode-generator (c) Kazuhiko Arase, MIT License == */\n'+fs.readFileSync(path.join(dir,'vendor','qrcode.js'),'utf8')+'\n// == /QR library ==\n';
js+=order.map(f=>fs.readFileSync(path.join(dir,'js',f),'utf8')).join('\n');
fs.writeFileSync(path.join(dir,'app.js'),js);
// 语法检查由调用方 node --check 完成
const tplPath=path.join(dir,'template.html');
if(fs.existsSync(tplPath)){
  let html=fs.readFileSync(tplPath,'utf8');
  if(!/\/\*__APP_JS__\*\//.test(html)) throw new Error('template.html 缺少 /*__APP_JS__*/ 占位符');
  html=html.replace('/*__APP_JS__*/', () => js);
  fs.writeFileSync(path.join(dir,'index.html'),html);
  console.log('built index.html', fs.statSync(path.join(dir,'index.html')).size, 'bytes');
}else{
  // 回退：替换现有 index.html 中的 <script> 块
  let html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  html=html.replace(/<script>[\s\S]*?<\/script>/, () => '<script>\n'+js+'\n</script>');
  fs.writeFileSync(path.join(dir,'index.html'),html);
  console.log('inlined into index.html', fs.statSync(path.join(dir,'index.html')).size, 'bytes');
}
