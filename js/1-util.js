"use strict";
/* ================= 通用工具 ================= */
function b64d(s){
  s=String(s).trim().replace(/-/g,'+').replace(/_/g,'/');
  s+='='.repeat((4-(s.length%4))%4);
  try{ return decodeURIComponent(escape(atob(s))); }
  catch(e){ try{ return atob(s); }catch(e2){ return null; } }
}
function b64e(s){ try{ return btoa(unescape(encodeURIComponent(s))); }catch(e){ return btoa(s); } }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function qs2obj(q){
  const o={};
  String(q||'').split('&').forEach(p=>{ if(!p) return;
    const i=p.indexOf('=');
    const k=decodeURIComponent(i<0?p:p.slice(0,i));
    if(!(k in o)) o[k]= i<0?'':decodeURIComponent(p.slice(i+1).replace(/\+/g,' '));
  });
  return o;
}
function obj2qs(o){
  return Object.entries(o).filter(([k,v])=>v!==undefined&&v!==null&&v!=='')
    .map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
}
function splitHostPort(hp,def){
  hp=String(hp||'');
  if(hp.startsWith('[')){ const e=hp.indexOf(']'); return [hp.slice(1,e), hp.slice(e+2)?+hp.slice(e+2):def]; }
  const i=hp.lastIndexOf(':');
  if(i>0 && /^\d+$/.test(hp.slice(i+1))) return [hp.slice(0,i), +hp.slice(i+1)];
  return [hp, def];
}
function splitComma(s){
  const out=[]; let cur='', q=null;
  for(let i=0;i<s.length;i++){ const c=s[i];
    if(q){ cur+=c; if(c===q) q=null; continue; }
    if(c==='"'||c==="'"){ q=c; cur+=c; continue; }
    if(c===','){ out.push(cur.trim()); cur=''; continue; }
    cur+=c;
  }
  if(cur.trim()) out.push(cur.trim());
  return out;
}
function trimStr(s){ return String(s==null?'':s).trim(); }

/* ================= YAML 解析（子集） ================= */
function stripComment(s){
  let out='', q=null;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){ out+=c; if(c===q) q=null; continue; }
    if(c==='"'||c==="'"){ q=c; out+=c; continue; }
    if(c==='#' && (i===0||/\s/.test(s[i-1]))) break;
    out+=c;
  }
  return out;
}
function parseYAML(text){
  const lines=[];
  String(text).replace(/\t/g,'   ').split(/\r?\n/).forEach(r=>{
    const s=stripComment(r).replace(/\s+$/,'');
    if(!s.trim()) return;
    lines.push({ind:s.length-s.trimStart().length, txt:s.trim()});
  });
  if(!lines.length) return {};
  let i=0;

  function parseScalar(s){
    s=trimStr(s);
    if(s==='') return null;
    if(s.length>1 && s[0]==='"' && s[s.length-1]==='"'){ try{ return JSON.parse(s); }catch(e){ return s.slice(1,-1); } }
    if(s.length>1 && s[0]==="'" && s[s.length-1]==="'") return s.slice(1,-1).replace(/''/g,"'");
    if(s==='true'||s==='True') return true;
    if(s==='false'||s==='False') return false;
    if(s==='null'||s==='~') return null;
    if(/^[{[]/.test(s)) return parseFlow(s);
    if(/^-?[\d.]+$/.test(s)&&!/^[\d.]*\D[\d.]*$/.test(s.replace(/^\d+\.?\d*$/,''))) {}
    if(/^[+-]?\d+$/.test(s)) return parseInt(s,10);
    if(/^[+-]?\d*\.\d+$/.test(s)) return parseFloat(s);
    return s;
  }
  function parseFlow(s){
    let p=0;
    const ws=()=>{ while(p<s.length&&/\s/.test(s[p])) p++; };
    function value(){ ws(); return s[p]==='['?arr():s[p]==='{'?obj():tok(); }
    function arr(){ p++; const a=[]; ws(); if(s[p]===']'){p++; return a;}
      while(p<s.length){ a.push(value()); ws();
        if(s[p]===','){ p++; continue; } if(s[p]===']'){ p++; break; } break; }
      return a; }
    function obj(){ p++; const o={}; ws(); if(s[p]==='}'){ p++; return o; }
      while(p<s.length){ ws(); const k=fkey(); ws();
        if(s[p]===':'){ p++; o[k]=value(); } else o[k]=null;
        ws(); if(s[p]===','){ p++; continue; } if(s[p]==='}'){ p++; break; } break; }
      return o; }
    function fkey(){ ws();
      if(s[p]==='"'||s[p]==="'"){ const q=s[p]; let t=''; p++;
        while(p<s.length&&s[p]!==q) t+=s[p++]; p++; return t; }
      let t=''; while(p<s.length && s[p]!==':' && !/[,{}\s]/.test(s[p])) t+=s[p++]; return t; }
    function tok(){ let t='';
      while(p<s.length){ const c=s[p];
        if(c===','||c===']'||c==='}') break;
        if(c==='"'||c==="'"){ const q=c; t+=c; p++;
          while(p<s.length&&s[p]!==q){ t+=s[p++]; } if(p<s.length){ t+=s[p++]; } continue; }
        t+=c; p++; }
      return parseScalar(t); }
    return value();
  }
  function splitKey(txt){
    let m=/^"((?:[^"\\]|\\.)*)"\s*:\s*(.*)$/.exec(txt); if(m) return {k:m[1],v:m[2]};
    m=/^'([^']*)'\s*:\s*(.*)$/.exec(txt); if(m) return {k:m[1],v:m[2]};
    m=/^("[^"]*"|'[^']*'|[^:\s][^:]*?)\s*:\s*(.*)$/.exec(txt); if(m) return {k:m[1].trim(),v:m[2]};
    return null;
  }
  function parseNode(ind){
    if(i>=lines.length) return null;
    return /^-(\s|$)/.test(lines[i].txt) ? parseSeq(ind) : parseMap(ind);
  }
  function parseSeq(ind){
    const a=[];
    while(i<lines.length && lines[i].ind===ind && /^-(\s|$)/.test(lines[i].txt)){
      const full=lines[i].txt, rest=full.replace(/^-\s*/,''), ci=ind+(full.length-rest.length);
      i++;
      if(rest===''){ if(i<lines.length&&lines[i].ind>ind) a.push(parseNode(lines[i].ind)); else a.push(null); }
      else if(/^[{[]/.test(rest)) a.push(parseFlow(rest));
      else{ const ent=splitKey(rest);
        if(ent){ const o={}; collectMap(o,ent,ci);
          // 同一序列项的后续兄弟键（缩进等于 ci）
          while(i<lines.length&&lines[i].ind===ci&&!/^-(\s|$)/.test(lines[i].txt)){
            const e2=splitKey(lines[i].txt); i++;
            if(!e2) break; collectMap(o,e2,ci);
          }
          a.push(o);
        }
        else a.push(parseScalar(rest)); }
    }
    return a;
  }
  function parseMap(ind){
    const o={};
    while(i<lines.length && lines[i].ind===ind && !/^-(\s|$)/.test(lines[i].txt)){
      const ent=splitKey(lines[i].txt); i++;
      if(!ent) continue;
      collectMap(o,ent,ind);
    }
    return o;
  }
  function collectMap(o,ent,ind){
    const v=ent.v;
    if(v!=='' && v!==undefined && v!==null){ o[ent.k]=/^[{[]/.test(trimStr(v))?parseFlow(trimStr(v)):parseScalar(v); return; }
    if(i<lines.length && lines[i].ind>ind){ o[ent.k]=parseNode(lines[i].ind); return; }
    if(i<lines.length && lines[i].ind===ind && /^-(\s|$)/.test(lines[i].txt)){ o[ent.k]=parseSeq(ind); return; }
    o[ent.k]=null;
  }
  return parseNode(lines[0].ind);
}
/* ================= YAML 序列化 ================= */
function yq(v){
  if(typeof v==='number'||typeof v==='boolean') return String(v);
  if(v===null||v===undefined) return 'null';
  const s=String(v);
  if(s==='') return '""';
  if(/^[\s>|@`&*!%#,?:\[\]{}\-]/.test(s)||/:\s/.test(s)||/\s#/.test(s)||/[\n"']/.test(s)||
     /^\s|\s$/.test(s)||['true','false','null','yes','no','on','off','~'].includes(s.toLowerCase())||
     /^-?[\d.]+$/.test(s)||/^[0-9a-fA-F]{2,16}$/.test(s))
    return '"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n')+'"';
  return s;
}
function yamlLines(v,ind){
  const pad='  '.repeat(ind), out=[];
  if(Array.isArray(v)){
    if(!v.length) return [pad+'[]'];
    for(const it of v){
      if(it&&typeof it==='object'&&(Array.isArray(it)?it.length:Object.keys(it).length)){
        const sub=yamlLines(it,ind+1);
        out.push(pad+'- '+sub[0].slice(pad.length+2));
        for(let k=1;k<sub.length;k++) out.push(pad+'  '+sub[k].slice(pad.length+2));
      } else out.push(pad+'- '+yq(it));
    }
    return out;
  }
  for(const [k,val] of Object.entries(v)){
    if(val===undefined) continue;
    const isArr=Array.isArray(val), isObj=val&&typeof val==='object'&&!isArr;
    if((isArr&&val.length)||(isObj&&Object.keys(val).length)){ out.push(pad+k+':'); out.push(...yamlLines(val,ind+1)); }
    else if(isArr) out.push(pad+k+': []');
    else if(isObj) out.push(pad+k+': {}');
    else out.push(pad+k+': '+yq(val));
  }
  return out;
}
function dumpYAML(o){ return yamlLines(o,0).join('\n')+'\n'; }
function clean(o){
  if(Array.isArray(o)) return o.map(clean).filter(v=>v!==null);
  if(o&&typeof o==='object'){
    const r={};
    for(const [k,v] of Object.entries(o)){
      if(v===null||v===undefined||v==='') continue;
      if(Array.isArray(v)&&!v.length) continue;
      const c=clean(v);
      if(c&&typeof c==='object'&&!Array.isArray(c)&&!Object.keys(c).length) continue;
      r[k]=c;
    }
    return r;
  }
  return o;
}
