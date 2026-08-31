/* ================= 二维码（纯前端本地生成） =================
 * 依赖 vendor/qrcode.js（Kazuhiko Arase 的 qrcode-generator，MIT License）。
 * 二维码在本机生成，不把订阅链接（含密钥）发送给任何第三方服务。
 */
function qrCellSize(text){
  const len=(text||'').length;
  let size=4;                       // 默认版本 4 足够 126 字符（纠错 M）
  if(len>126) size=6;               // 版本 6 可到 208 字符
  if(len>208) size=8;               // 版本 8 可到 330 字符
  if(len>330) size=10;              // 版本 10 可到 488 字符
  return Math.min(size,40);
}
function qrTypeNumber(text){
  const cells=qrCellSize(text);
  return cells===40?40:(cells-1)*4+1;
}
function makeQRCanvas(text,px){
  if(typeof qrcode!=='function'||!text) return null;
  const qr=qrcode(qrTypeNumber(text),'M');
  if(!qr) return null;
  qr.addData(text); qr.make();
  const mod=qr.getModuleCount(), n=qr.getModuleCount()+8, s=Math.ceil(px/n);
  if(n<=0||mod<=0) return null;
  const cv=document.createElement('canvas');
  cv.width=s*n; cv.height=s*n;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,cv.width,cv.height);
  ctx.fillStyle='#0b0e1a';
  for(let r=0;r<mod;r++) for(let c=0;c<mod;c++) if(qr.isDark(r,c)) ctx.fillRect((c+4)*s,(r+4)*s,s,s);
  return cv;
}
function showQR(id,text){
  const wrap=document.getElementById(id);
  if(!wrap) return;
  wrap.innerHTML='';
  const cv=makeQRCanvas(text,240);
  if(!cv){ wrap.textContent='二维码生成失败'; wrap.style.display='block'; return; }
  wrap.appendChild(cv);
  wrap.style.display='flex';
}
function downQRBlob(text){
  const cv=makeQRCanvas(text,360);
  return cv && cv.toDataURL('image/png');
}
function downloadQR(note,text){
  const ok=0, bad='';
  const data=downQRBlob(text);
  if(!data){ const m=$('msg'); if(m){m.className='msg err';m.textContent='二维码生成失败';} return; }
  const a=document.createElement('a');
  a.href=data; a.download=(note||'subscription')+'-qrcode.png';
  document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),900);
}
function showRelayQR(){
  const url=$('relay-url').value.trim();
  if(!url){$('msg').className='msg warn';$('msg').textContent='请先生成订阅链接';return;}
  showQR('relay-qr',url);
  $('relay-qr-down').style.display='inline-block';
}
function downloadRelayQR(){
  const url=$('relay-url').value.trim();
  if(!url){$('msg').className='msg warn';$('msg').textContent='请先生成订阅链接';return;}
  downloadQR('subconv-subscription',url);
}