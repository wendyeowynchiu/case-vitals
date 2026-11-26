const BOOT=window.__BOOT,DB=BOOT.db,CM=BOOT.cm||{};
const {weeks:WEEKS,vocab:VOC,shw:SHW,sums:SUMS,ch:CH}=DB;
const cases=DB.cases;
const TODAY=BOOT.today, YR=TODAY.slice(0,4), T0=new Date(TODAY+'T00:00:00');
const PLC=BOOT.planners.current, PL=[...PLC,...BOOT.planners.former], MK=['Design','Coding','Video','Support','UI'];
const HOLD=/暫緩|暫停|hold/i;
const SRC={Design:'多媒體設計（平面）',Video:'多媒體設計（影片）',UI:'多媒體設計（UI）',Coding:'MIS（Coding）',Support:'MIS（Support）'};
PL.forEach(p=>{SRC[p]='行銷企劃 '+p+(PLC.includes(p)?'':'（歷史）')});
const DEPT=c=>c.g==='p'?'plan':(c.src==='Coding'||c.src==='Support')?'mis':'mm';
const SRCL=SRC;
const COL={Design:'--s1',Coding:'--s2',Video:'--s3',Support:'--s4',UI:'--s5'};
PL.forEach((p,i)=>{COL[p]='--s'+(i%5+1)});
const NPR=/沒有進度|沒進度|無進度/, DONE_RE=/完成|結案|已上線|已結束|取消|cancel|已測試|done|已上傳/i, WAIT_RE=/待|等|pending|已發|暫緩|暫停|處理中|已開單|開單/i;
const CLOSING=/結案|已上線|已結束|取消|cancel|已測試|done|已上傳|已發布|已發佈/i, FINAL_STEP=/上線|上架|上傳|發布|發佈|更新|印製|付款|寄出|交付|報名|加工|收到|確認/i;
/* 「設計完成」「圖片完成」只是某一段做完，不算整案結案；「已完成」「上線完成」才算 */
function isDone(s){if(!s||/待|等/.test(s)||!DONE_RE.test(s))return false;if(CLOSING.test(s))return true;for(const m of s.matchAll(/([^,，;；。\s/()（）]*)完成/g)){const w=m[1].replace(/[\d/\-.:月日號已經都全部]|大致/g,'');if(!w||FINAL_STEP.test(w))return true}return false}
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const D=s=>s?new Date(s+'T00:00:00'):null, days=(a,b)=>Math.round((a-b)/864e5);
const md=s=>{if(!s)return'未定';const[y,m,d]=s.split('-');return(y!==YR?y+'/':'')+(+m)+'/'+(+d)};
/* ---------- local overrides ---------- */
let OV=(BOOT.ov&&typeof BOOT.ov==='object')?BOOT.ov:{};
function flash(msg,bad){const f=$('flash');f.textContent=msg;f.className=bad?'bad':'';f.hidden=false;clearTimeout(flash.t);flash.t=setTimeout(()=>f.hidden=true,bad?6000:1600)}
const putState=()=>fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(OV)}).then(r=>{if(!r.ok)throw 0;flash('已儲存')}).catch(()=>flash('沒有存成功，請重新整理後再試一次',1));
let saveT;const save=()=>{if(BOOT.role!=='admin')return;clearTimeout(saveT);saveT=setTimeout(putState,400)};
const ov=id=>OV[id]||(OV[id]={});
const byId=new Map(cases.map(c=>[c.id,c]));
const GF=()=>OV._fields||(OV._fields=[]);
if(!OV._seeded){OV._seeded=1;GF().push({k:'f1',name:'需求來源',type:'select',opts:['PM','Sales','老闆','自發','其他']});save()}
let KC=new Map();const relink=()=>{KC=new Map();for(const id in OV){const p=OV[id]&&OV[id].p;if(p)KC.set(p,(KC.get(p)||0)+1)}};relink();
const kids=id=>cases.filter(x=>OV[x.id]&&OV[x.id].p===id);
const big=c=>{if(c._b)return c._b;const s=(c.desc||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');const b=new Set();for(let i=0;i<s.length-1;i++)b.add(s.slice(i,i+2));return c._b=b};
function sim(a,b){const A=big(a),B=big(b);if(A.size<3||B.size<3)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.min(A.size,B.size)}
function suggest(c){const want=c.g==='p'?'m':'p';return cases.filter(x=>x.g===want&&!(want==='m'&&OV[x.id]&&OV[x.id].p)).map(x=>[sim(c,x)+(x.done?0:.05),x]).filter(r=>r[0]>=.62).sort((a,b)=>b[0]-a[0]).slice(0,4).map(r=>r[1])}
let VIEW=BOOT.role!=='admin';
/* 把一份快照整理成可以計算的案件清單：套用站上的手動判定，算出最後有進度的日期與沒有進度幾週 */
function prep(list,db,today){const t0=new Date(today+'T00:00:00'),bid=new Map(list.map(c=>[c.id,c]));
  list.forEach(c=>{c._db=db;c.y=(c.closed||c.due||c.req||'').slice(0,4)||String(c.yr||'');
    const tr=(BOOT.dueHist&&BOOT.dueHist[c.id]||[]).filter(e=>e[0]<=today);  // 站上記下的改期軌跡
    if(tr.length>1){let later=0;for(let i=1;i<tr.length;i++)if(tr[i][1]>tr[i-1][1])later++;if(later&&!c.ext){c.ext=later;c.due0=tr[0][1];c.moved=tr}}});
  for(const id in OV){const o=OV[id],c=bid.get(id);if(!o||!c)continue;if(o.req)c.req=o.req;
    if(o.dn===0||o.dn===1){c.done=o.dn;c.auto=0;c.manual=1;if(o.dn&&!c.closed)c.closed=c.due||c.req||today;if(!o.dn)delete c.closed}}
  list.forEach(c=>{if(c.g!=='p'){c.la=c.req||c.due||'';return}let la=null;for(const[wi,s]of hmap(c)){const w=db.weeks[wi];if(!NPR.test(s)&&(!la||w>la))la=w}c.la=la||c.req||'';
    if(!c.done){const base=la||c.req;c.stall=base?Math.max(0,Math.round(days(t0,D(base))/7)):0}});
  return list}
prep(cases,DB,TODAY);
const PREV=BOOT.prev?prep(BOOT.prev.cases,BOOT.prev,BOOT.prev.today):null, DF=PREV&&BOOT.diff?BOOT.diff:null;
/* 和上一次匯入相比的差距標示 */
function dl(cur,prev,digits){if(!PREV)return'';if(prev===undefined||prev===null)return' <span class="dl" data-tip="上次沒有這一項">新</span>';const d=+(cur-prev).toFixed(digits||0);return d?` <span class="dl" data-tip="上次是 ${prev}">${d>0?'▲':'▼'}${Math.abs(d)}</span>`:''}
const med=a=>{a=[...a].sort((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)/2)]:0};
const mStage=list=>list.filter(c=>!c.done).reduce((m,c)=>m.set(c.status||'未填',(m.get(c.status||'未填')||0)+1),new Map());
const mWork=(list,db)=>Object.fromEntries(PLC.map(p=>{const w=db.shw[p]||[],has=wi=>list.filter(c=>c.src===p&&hmap(c).get(wi)&&!NPR.test(hmap(c).get(wi))).length;let wi=w[0],n=has(wi);if(!n&&w.length>1){wi=w[1];n=has(wi)}return[p,{n,wk:db.weeks[wi]||''}]}));
const mWd=(list,today)=>Object.fromEntries(MK.map(u=>{const a=list.filter(c=>c.src===u&&c.done===1&&c.req&&(c.closed||'').startsWith(today.slice(0,4))).map(c=>wd(c.req,c.closed));return[u,{n:a.length,v:med(a)}]}));
const mVer=(list,today)=>Object.fromEntries(MK.map(u=>{const all=list.filter(c=>c.src===u&&c.yr===+today.slice(0,4)),a=all.filter(c=>c.ver>=1);return[u,{n:a.length,all:all.length,v:a.length?+(a.reduce((s,c)=>s+c.ver,0)/a.length).toFixed(1):0,m:Math.max(0,...a.map(c=>c.ver))}]}));

function hmap(c){if(!c._h){const V=(c._db||DB).vocab;c._h=new Map();for(let i=0;i<(c.h||[]).length;i+=2)c._h.set(c.h[i],V[c.h[i+1]])}return c._h}
function wd(a,b){if(!a||!b)return null;const d1=D(a),d2=D(b);if(d2<d1)return 0;const tot=days(d2,d1);let n=Math.floor(tot/7)*5;const dow=d1.getDay();for(let i=0;i<tot%7;i++){const x=(dow+i)%7;if(x!==0&&x!==6)n++}return n}
const STG=[['plan','企劃作業','--s1'],['queue','已接收未開始','--acc2'],['design','設計階段','--s5'],['coding','Coding 階段','--s2'],['wait','等確認／等對方','--s4'],['idle','沒有進度','--idle'],['done','完成','--s3']];
const STGN=Object.fromEntries(STG.map(s=>[s[0],s])),SV=k=>`var(${STGN[k][2]})`;
function stageOf(s){if(!s)return null;if(NPR.test(s))return'idle';if(isDone(s))return'done';if(/cod|程式|mis|前端|後端|發信|上線|上傳|測試/i.test(s))return'coding';if(/設計|design|開單|修改|v\d|\bgd\b|排版|美化/i.test(s))return'design';if(/pending/i.test(s))return'queue';if(/確認|review|等|待|暫|回覆/i.test(s))return'wait';return'plan'}
function stageStats(p){const n={},mv={},hm=hmap(p),SHW=(p._db||DB).shw,WEEKS=(p._db||DB).weeks;if(!hm.size)return[n,mv,0];const ks=[...hm.keys()],lo=Math.min(...ks),hi=Math.max(...ks),cols=(SHW[p.src]||ks).filter(i=>i>=lo&&i<=hi).sort((a,b)=>b-a);let tot=0;
  cols.forEach((wi,j)=>{const s=hm.get(wi),st=s?stageOf(s):'idle',w=j<cols.length-1?Math.max(1,Math.round(days(D(WEEKS[cols[j+1]]),D(WEEKS[wi]))/7)):1;n[st]=(n[st]||0)+w;tot+=w;const v=s&&(s.match(/[Vv](\d)/)||[])[1];if(v)mv[st]=Math.max(mv[st]||0,+v)});return[n,mv,tot]}
const wks=(a,b)=>Math.round(days(D(b),D(a))/7)+1;
const CATS=['專案／網頁','FAQ','社群','影片','文宣','展覽','活動','電商','內容／翻譯','其他'];
const CATR=[[/faq/i,'FAQ'],[/social|sociomedia|社群|linkedin|facebook|\bfb\b|\big\b|貼文|小編/i,'社群'],[/video|影片|youtube|tutorial/i,'影片'],[/\bces\b|computex|cp\+|gitex|himss|hmiss|exhibition|展覽|參展|expo|engage|\bidw\b|\bifa\b|congr|fit osaka|techshow|accounting show/i,'展覽'],[/anniversary|周年|週年|event|活動|campaign|promotion|促銷|giveaway/i,'活動'],[/amazon|ecommerce|e-commerce|ebay|alibaba|電商|a\+\+/i,'電商'],[/leaflet|\bdm\b|poster|banner|catalog|brochure|文宣|海報|型錄|傳單|graphics|\bpop\b|icon/i,'文宣'],[/case study|translation|翻譯|article|blog|文章|press|newsroom|新聞稿|eblast|emailing/i,'內容／翻譯'],[/project|web|網頁|website|landing|seo|coding|warranty|sitemap|schema|page/i,'專案／網頁']];
const rawCat=c=>(c.topic||'').trim()||'（未填）';
function catOf(c){const m=OV._catmap&&OV._catmap[rawCat(c)];if(m)return m;if(c._k)return c._k;const f=s=>{for(const[r,k]of CATR)if(r.test(s))return k;return null};return c._k=f(c.topic||'')||f([c.cat,c.kind].join(' '))||f(c.desc||'')||'其他'}
let PF={k:''};
const SG=STG.filter(g=>g[0]!=='done');
const mCat=(list,today)=>Object.fromEntries(CATS.map(k=>{const a=list.filter(c=>PLC.includes(c.src)&&c.done===1&&(c.closed||'').startsWith(today.slice(0,4))&&c.req&&catOf(c)===k).map(c=>wks(c.req,c.closed));return[k,{n:a.length,v:med(a)}]}));
const mComp=(list,today,kc)=>Object.fromEntries(PLC.map(p=>{const cs=list.filter(c=>c.src===p&&c.done===1&&(c.closed||'').startsWith(today.slice(0,4))&&c.h&&c.h.length&&(!kc||catOf(c)===kc)),tot={},wz=[];
  cs.forEach(c=>{const[n]=stageStats(c);SG.forEach(g=>{tot[g[0]]=(tot[g[0]]||0)+(n[g[0]]||0)});if(c.req&&c.closed)wz.push(wks(c.req,c.closed))});
  const op=list.filter(c=>c.src===p&&!c.done&&c.req&&(!kc||catOf(c)===kc)),avg=Object.fromEntries(SG.map(g=>[g[0],(tot[g[0]]||0)/(cs.length||1)]));
  return[p,{p,n:cs.length,md:med(wz),avg,sum:+SG.reduce((s,g)=>s+avg[g[0]],0).toFixed(1),open:op.length,age:med(op.map(c=>wks(c.req,today)))}]}));
const kStart=k=>k.req||null,kEnd=k=>k.closed||(k.done?k.due:TODAY);
function handoff(ks){const de=ks.filter(k=>k.src==='Design'&&k.done&&kEnd(k)).map(kEnd).sort().pop(),cs=ks.filter(k=>k.src==='Coding'&&k.req).map(k=>k.req).sort()[0];if(!de||!cs)return null;return cs>=de?wd(de,cs)+' 個工作日':'重疊進行'}
function flowParent(c){if(c.g==='p')return c;const pid=OV[c.id]&&OV[c.id].p;return pid?byId.get(pid):null}
function flowHTML(c){const p=flowParent(c);if(!p)return'';if(!kids(p.id).length&&(p.h||[]).length<8)return'';
  return`<div><h4>流程時間軸（企劃 → 設計 → Coding）</h4><div class="legend" id="flowLg"></div><div class="scrollx" style="margin-top:6px"><div class="chart" id="flowC" style="min-width:560px"></div></div><ul class="fam" id="flowS" style="margin-top:10px;font-size:13.5px"></ul></div>`}
function drawFlow(c){const el=$('flowC');if(!el)return;const p=flowParent(c),ks=kids(p.id).sort((a,b)=>(a.req||a.fv||a.closed||a.due||'').localeCompare(b.req||b.fv||b.closed||b.due||''));
  const hm=hmap(p),ws=[...hm.keys()].sort((a,b)=>WEEKS[a].localeCompare(WEEKS[b]));
  const ds=[TODAY,p.req,p.due,...ks.flatMap(k=>[k.req,k.fv,kEnd(k),k.due])].filter(Boolean);if(ws.length)ds.push(WEEKS[ws[0]]);
  const t0=D(ds.reduce((a,b)=>a<b?a:b)),t1=D(ds.reduce((a,b)=>a>b?a:b));t0.setDate(t0.getDate()-7);t1.setDate(t1.getDate()+10);
  const W=Math.max(560,el.clientWidth),L=104,R=8,T=20,rh=30,H=T+rh*(1+ks.length)+4,xd=d=>L+(W-L-R)*(d-t0)/(t1-t0),x=s=>xd(D(s));
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="母案與子案的流程時間軸">`;
  const span=(t1-t0)/864e5,step=span>900?12:span>400?6:3;for(let d=new Date(t0.getFullYear(),0,1);d<t1;d.setMonth(d.getMonth()+step)){if(d<t0)continue;s+=`<line x1="${xd(d)}" x2="${xd(d)}" y1="${T-4}" y2="${H}" stroke="${cv('--grid')}"/><text x="${xd(d)+3}" y="11">${d.getFullYear()}/${d.getMonth()+1}</text>`}
  s+=`<text x="${L-8}" y="${T+19}" text-anchor="end">企劃 ${esc(p.src)}</text>`;
  ws.forEach((wi,i)=>{const st=stageOf(hm.get(wi));if(!st)return;const a=x(WEEKS[wi]),nx=i<ws.length-1?x(WEEKS[ws[i+1]]):a+(W-L-R)*7/span,w=Math.max(2,Math.min(nx-a,(W-L-R)*14/span)-1);
    s+=`<rect x="${a.toFixed(1)}" y="${T+5}" width="${w.toFixed(1)}" height="${rh-10}" rx="2" fill="${SV(st)}" data-tip="${esc(`<b>${WEEKS[wi].replace(/-/g,'/')} 週會</b><br>${esc(hm.get(wi))}<br>判讀為：${STGN[st][1]}`)}"/>`});
  ks.forEach((k,r)=>{const y=T+rh*(r+1),a=kStart(k),b=kEnd(k),col=cv(COL[k.src]),n=wd(a,b);
    s+=`<text x="${L-8}" y="${y+19}" text-anchor="end">${esc(k.g==='p'?'企劃 '+k.src:SRC[k.src])}</text>`;
    const tipk=`<b>${esc(k.desc)}</b><br>${a?'開單 '+md(a):'沒有開單日'}${k.fv?'｜第一版 '+md(k.fv):''}｜${k.done?'結案 '+md(b):'進行中'}`+(n!=null?`<br>${n} 個工作日`:'')+(k.ver?`｜第 ${k.ver} 版`:'')+(k.ext?`｜展延 ×${k.ext}`:'');
    if(a)s+=`<rect x="${x(a).toFixed(1)}" y="${y+6}" width="${Math.max(4,x(b)-x(a)).toFixed(1)}" height="${rh-12}" rx="5" fill="${col}" ${k.done?'':'fill-opacity=".45" stroke="'+col+'" stroke-dasharray="4 3"'} data-tip="${esc(tipk)}"/>`;
    else if(b){const cx=x(b),cy=y+rh/2;s+=`<path d="M${cx} ${cy-8}L${cx+8} ${cy}L${cx} ${cy+8}L${cx-8} ${cy}Z" fill="${col}" data-tip="${esc(tipk)}"/><text x="${cx-12}" y="${cy+4}" text-anchor="end">沒有開單日</text>`}
    if(k.fv)s+=`<circle cx="${x(k.fv)}" cy="${y+rh/2}" r="4" fill="${cv('--dlg')}" stroke="${cv('--text')}" stroke-width="1.5" data-tip="第一版 ${md(k.fv)}"/>`});
  s+=`<line x1="${x(TODAY)}" x2="${x(TODAY)}" y1="${T-4}" y2="${H}" stroke="${cv('--blue')}" stroke-dasharray="3 3"/><text x="${x(TODAY)-4}" y="${H-2}" text-anchor="end" style="fill:${cv('--blue')}">今天</text>`;
  el.innerHTML=s+'</svg>';
  $('flowLg').innerHTML=STG.map(g=>`<span><i style="background:var(${g[2]})"></i>${g[1]}</span>`).join('');
  const[n,mv]=stageStats(p),tot=Object.values(n).reduce((a,b)=>a+b,0);
  let out=tot?`<li><span class="tag blu">企劃歷時</span><span>歷時 ${tot} 週（用日曆算，空白週算沒有進度）：${STG.filter(g=>n[g[0]]).map(g=>`${g[1]} ${n[g[0]]} 週`+(mv[g[0]]?`（最高 V${mv[g[0]]}）`:'')).join('、')}</span></li>`:'';
  out+=ks.map(k=>{const a=kStart(k),b=kEnd(k),d=wd(a,b);return`<li><span class="tag">${esc(SRC[k.src])}</span><span>${d!=null?`${d} 個工作日（${md(a)} 開單 → ${k.done?md(b)+' 結案':'進行中'}）`:'Excel 沒有填開單日，無法計算工作日'+(k.done&&b?`，${md(b)} 結案`:'')}${k.fv&&a?`｜開單到第一版 ${wd(a,k.fv)} 個工作日`:''}${k.ver?`｜第 ${k.ver} 版`:''}${k.ext?`｜展延 ×${k.ext}`:''}</span></li>`}).join('');
  const ho=handoff(ks);if(ho)out+=`<li><span class="tag pur">交接</span><span>設計結案 → Coding 開單：${ho}</span></li>`;
  $('flowS').innerHTML=out}
function renderPipeline(){
  const kc=PF.k,PT=PREV&&BOOT.prev.today;
  $('lg-stg').innerHTML=SG.map(g=>`<span><i style="background:var(${g[2]})"></i>${g[1]}</span>`).join('');
  chips('pfChips',[['','全部分類'],...CATS.map(k=>[k,k])],kc,'data-pk');
  const comp=mComp(cases,TODAY,kc),compP=PREV&&mComp(PREV,PT,kc),prow=PLC.map(p=>comp[p]),pmx=Math.max(...prow.map(r=>r.sum),1);
  $('stgRows').innerHTML=prow.map(r=>{const q=compP&&compP[r.p];return`<div class="srow"><span><b>${r.p}</b><small>${r.n?`結案 ${r.n} 案${q?dl(r.n,q.n):''}｜中位 ${r.md} 週${q&&q.n?dl(r.md,q.md):''}`:'這個分類今年沒有結案'}</small></span><div><div class="sbar" style="width:${(r.sum/pmx*100).toFixed(1)}%">${SG.map(g=>{const v=r.avg[g[0]];return v>0.04?`<span style="flex:${v};background:var(${g[2]})" data-tip="${esc(`<b>${r.p}｜${g[1]}</b><br>平均每案 ${v.toFixed(1)} 週`)}"></span>`:''}).join('')}</div></div><em>${r.n?r.sum.toFixed(1)+' 週'+(q&&q.n?dl(r.sum,q.sum,1):''):'—'}</em></div>`}).join('');
  $('stgNote').textContent='目前列管中'+(kc?'（'+kc+'）':'')+'：'+prow.map(r=>`${r.p} ${r.open} 案`+(r.open?`（中位已開 ${r.age} 週）`:'')).join('、')+'。';
  const cat=mCat(cases,TODAY),catP=PREV&&mCat(PREV,PT);
  hbars('catBars',CATS.filter(k=>cat[k].n>=3).map(k=>({l:k,v:cat[k].v,d:catP&&catP[k].n>=3?dl(cat[k].v,catP[k].v):'',t:`<b>${k}</b><br>中位 ${cat[k].v} 週（${cat[k].n} 案）`})));
  const noReq=cases.filter(c=>c.src==='Design'&&!c.req&&(c.yr===+YR||!c.done));$('reqCount').textContent=noReq.length;
  const wdm=mWd(cases,TODAY),wdP=PREV&&mWd(PREV,PT);
  hbars('wdBars',MK.filter(u=>wdm[u].n>=3).map(u=>({l:SRC[u],v:wdm[u].v,d:wdP&&wdP[u].n>=3?dl(wdm[u].v,wdP[u].v):'',t:`<b>${SRC[u]}</b><br>中位數 ${wdm[u].v} 個工作日（${wdm[u].n} 件）`})));
  $('wdNote').textContent=wdm.Design.n>=3?'':'多媒體設計（平面）沒有出現，是因為設計表幾乎沒有填「申請時間」，算不出工作日。';
  const vm=mVer(cases,TODAY),vP=PREV&&mVer(PREV,PT);
  hbars('verBars',MK.filter(u=>vm[u].n>=3).map(u=>({l:SRC[u],v:vm[u].v,d:vP&&vP[u].n>=3?dl(vm[u].v,vP[u].v,1):'',t:`<b>${SRC[u]}</b><br>平均第 ${vm[u].v} 版，最高第 ${vm[u].m} 版<br>${vm[u].all} 件中有 ${vm[u].n} 件留下版本紀錄`})));
  const ps=[...KC.keys()].map(id=>byId.get(id)).filter(Boolean);
  const cell=(ks,u)=>{const a=ks.filter(k=>k.src===u);if(!a.length)return'—';const d=a.map(k=>wd(kStart(k),kEnd(k))).filter(v=>v!=null),v=Math.max(0,...a.map(k=>k.ver||0));return`${a.length} 件｜${d.length?d.reduce((x,y)=>x+y,0)+' 日':'無開單日'}${v?'｜V'+v:''}`};
  $('famTable').innerHTML=ps.length?`<table class="ft"><thead><tr><th>母案</th><th>企劃歷時</th><th>設計</th><th>Coding</th><th>影片</th><th>設計→Coding</th><th>目前</th></tr></thead><tbody>${ps.map(p=>{const ks=kids(p.id),[n,mv]=stageStats(p),tot=Object.values(n).reduce((a,b)=>a+b,0),o=ks.filter(k=>!k.done);
    return`<tr><td><a class="lnk" data-id="${p.id}">${esc(p.desc)}</a><br><small style="color:var(--muted)">${esc(SRC[p.src])}</small></td><td class="n">${tot} 週<br>沒進度 ${n.idle||0} 週</td><td class="n">${cell(ks,'Design')}</td><td class="n">${cell(ks,'Coding')}</td><td class="n">${cell(ks,'Video')}</td><td class="n">${handoff(ks)||'—'}</td><td>${p.done?'<span class="tag grn">已結案</span>':esc(p.status||'')+(o.length?'<br><small style="color:var(--muted)">子案未結 '+o.length+' 件</small>':'')}</td></tr>`}).join('')}</tbody></table>`:'<span style="color:var(--muted);font-size:13px">還沒有連結任何母子案。打開一個企劃案件，在「建議配對」按「連成子案」，這裡就會出現。</span>'}
/* ---------- metrics ---------- */
function metrics(c){const m={late:0,soon:false,stall:c.done?0:(c.stall||0),age:0,wait:false};
  if(c.done)return m; m.hold=HOLD.test(c.status||''); if(c.due&&!m.hold){const d=days(T0,D(c.due)); if(d>0)m.late=d; else if(d>=-7)m.soon=true}
  if(c.req)m.age=days(T0,D(c.req)); m.wait=WAIT_RE.test(c.status||''); return m}
function score(c){if(c._s!==undefined)return c._s; if(c.done)return c._s=0; const m=metrics(c); if(m.hold)return c._s=0;
  return c._s=(m.late?2+Math.min(3,Math.floor(m.late/30)):0)+(c.ext||0)+((c.ver||0)>=3?1:0)+((c.ver||0)>=6?1:0)+(m.stall>=3?2:0)+(m.stall>=12?1:0)+(m.age>365?1:0)+(m.soon?1:0)}
function level(c){if(c.done===2)return['歷史歸檔',''];if(c.done)return['已結案','grn'];if(metrics(c).hold)return['暫緩','pur'];const s=score(c);return s>=5?['重大異常','red']:s>=3?['異常','red']:s>=1?['關注','amb']:['例行','blu']}
function tags(c){const m=metrics(c),t=[];
  if(m.late)t.push(['逾期 '+m.late+' 日','red']); if(c.ext)t.push(['展延 ×'+c.ext,c.ext>=2?'red':'amb']);
  if((c.ver||0)>=2)t.push(['第 '+c.ver+' 版',c.ver>=3?'amb':'']); if(m.stall>=2)t.push(['無進度 '+m.stall+' 週',m.stall>=3?'red':'amb']);
  if(m.soon)t.push(['7 日內到期','pur']); if(KC.get(c.id))t.push(['母案 ×'+KC.get(c.id),'blu']); if(OV[c.id]&&OV[c.id].p)t.push(['子案','blu']); if(c.auto)t.push(['依隱藏列認定','']); if(c.manual)t.push(['管理者判定','']); return t}
/* ---------- comments ---------- */
const POOLS=[
 [/下架|remove|移除/i,['准予下架。產品功成身退，本中心致上敬意，並提醒相關連結一併帶走。','下架完成。網頁沒有告別式，本中心在此代為默哀一秒。']],
 [/cancel|取消/i,['本案業經取消。本中心對曾經投入的時間，謹致上最深的哀悼。','取消備查。沒有做的事不會出錯，就品質而言無懈可擊。']],
 [/翻譯|translation|translate/i,['翻譯完成。語言隔閡已排除，文化隔閡另案辦理。','准予結案。本中心不懂該語言，但相信承辦人。','翻譯結案。在地化不是換個語言重講一遍，本案深明此理。']],
 [/amazon|a\+\+|ebay|ecommerce|首圖/i,['A++ 結案。圖片已盡力，剩下交給演算法與消費者的緣分。','電商素材結案。本中心提醒：五顆星是買家給的，不是設計給的。','結案備查。主圖白底規範嚴格，本案安全過關。']],
 [/poster|海報|背板|背牆|pop\b|roll.?up/i,['海報結案。展場燈一打，所有修改都值得了（大致上）。','准予結案。輸出尺寸經再三確認，本中心仍建議再確認一次。','海報已定稿。logo 的大小，終於取得各方共識。']],
 [/banner/i,['Banner 結案。尺寸共若干種，本中心不忍細數。','准予結案。這張 Banner 將在首頁停留數週，然後被下一張取代，這就是人生。','Banner 已上架。輪播第一張的位置，向來兵家必爭。']],
 [/landing/i,['Landing Page 結案。訪客順利降落，跳出率另案觀察。','准予結案。活動結束後記得下架，本中心已見過太多 2023 年的活動頁。']],
 [/leaflet|dm\b|catalog|brochure|傳單|型錄|折頁/i,['文宣結案。規格表已核對，若仍有錯字，那是它自己長出來的。','准予結案。PDF 已上架，紙本是否印製，視預算與地球而定。','DM 定稿。正反兩面，面面俱到。']],
 [/video|影片|youtube|tutorial|錄製|拍攝/i,['影片結案。片長不長，後製很長。','准予結案。本中心已按讚訂閱，並開啟小鈴鐺。','影片已上傳。觀看次數的第一位貢獻者，向來是承辦人本人。']],
 [/faq/i,['FAQ 更新完畢。常見問題又多了幾題，顯示用戶求知若渴。','准予結案。問題有了答案，客服同仁可望少接幾通電話。']],
 [/social|貼文|po文|linkedin|facebook|\bfb\b|\big\b|小編/i,['貼文已發布。演算法是否賞臉，本中心無權干涉。','社群結案。按讚的同事，本中心都有看到。','准予結案。Hashtag 數量適中，本中心嘉許。']],
 [/case study|案例/i,['案例研究結案。客戶的成功故事，背後是承辦人的催稿故事。','准予結案。客戶同意具名，可喜可賀。']],
 [/press|newsroom|新聞稿|\bpr\b/i,['新聞稿已發布。本中心認為這是大新聞，至於媒體怎麼想，另案處理。','准予結案。稿內「領先業界」一詞使用次數，尚在合理範圍。']],
 [/driver|download|驅動|韌體|firmware/i,['驅動程式已更新。使用者終於可以安裝了，前提是找得到下載頁。','准予結案。版本號又前進了一小步。']],
 [/where to buy|wtb|reseller|經銷/i,['購買通路已更新。想買的人，現在知道該去哪裡了。','准予結案。經銷商名單異動，本中心已同步祝福。']],
 [/sitemap|seo|schema|json|hreflang|geo/i,['結案。搜尋引擎表示看懂了，雖然它從不回信。','准予結案。這類工程使用者看不見，本中心看見了。']],
 [/spec|規格/i,['規格已更新。數字都對了，單位也對了，本中心相當意外。','准予結案。dpi、ppm 與 mm 各安其位。']],
 [/icon|logo/i,['Icon 結案。體積雖小，討論不少。','准予結案。32 像素之內的美學，本中心肅然起敬。']],
 [/email|eblast|edm|電子報|emailing/i,['電子報已寄出。開信率未公開前，本中心一律視為成功。','准予結案。主旨欄經過反覆推敲，值得一開。']],
 [/簡報|ppt|powerpoint|sales kit|deck/i,['簡報結案。頁數在合理範圍，動畫效果克制，本中心嘉許。','准予結案。業務同仁拿到了，至於會不會打開，本中心樂觀。']],
 [/會議|meeting|minutes/i,['會議記錄完成。會議是否有結論，記錄中未載明。','准予結案。與會者皆已收到記錄，已讀與否不在本中心管轄範圍。']],
 [/report|報告|mrr|統計/i,['報告已提交。數字會說話，本中心負責聽。','准予結案。圖表顏色搭配得宜，結論另議。']],
 [/giveaway|贈品|禮品|紀念品/i,['贈品結案。展場最受歡迎的，往往不是產品。','准予結案。數量已清點，本中心沒有私藏。']],
 [/測試|test|eval|competitor|競品/i,['測試完成。知己知彼，報告已歸檔。','准予結案。競品研究結論：我們比較好，本中心並不意外。']],
 [/ces|computex|cp\+|gitex|himss|engage|idw|展|exhibition|show|booth|攤位/i,['展覽相關事項結案。攤位三天，籌備三個月，本中心都記著。','准予結案。展後檢討會議，預計將產生下一批案件。','展務結案。行李超重的部分，本中心不予列管。']],
 [/上線|上架|webpage|網頁|website|頁面|官網/i,['網頁已上線。請各位同仁清除快取後再回報問題。','准予結案。全區同步完成，時區問題已克服。','網頁結案。連結皆可點擊，本中心已逐一試過（抽樣）。']],
];
const DEF=['本案業已結案，本中心予以備查。','本案順利結案，過程平淡無奇，殊堪嘉許。','准予結案。本中心查無異常，這本身就是一種異常。','結案歸檔。此案曾經很急，現在已無人記得。','准予備查。又一件事從待辦清單上消失，世界稍微安靜了一點。'];
const hash=s=>{let h=0;for(const ch of s)h=(h*31+ch.charCodeAt(0))>>>0;return h};
function gen(c){
  const text=[c.desc,c.kind,c.cat,c.topic,c.status].join(' '),h=hash(c.id);
  if(!c.done){const m=metrics(c);
    if(m.stall>=8)return'最後狀態為「'+(c.status||'未填')+'」，此後 '+m.stall+' 週沒有進度。本中心沒有忘記，只是也沒有辦法。';
    if(m.late)return'本案已逾期 '+m.late+' 日，本中心表示高度關切，並將持續關切。';
    if(m.stall>=3)return'本中心已連續 '+m.stall+' 週未觀測到本案生命跡象。';
    return'本案進度正常，本中心暫無意見，特此記錄以茲證明曾有此事。'}
  if(c.auto)return(/終結|移除|取消|不做|cancel/i.test(c.status||'')?'本案已喊停，Excel 也已收起，本中心據此結案。':'這一列在 Excel 已被收起，本中心據此認定結案。最後狀態為「'+(c.status||'未填')+'」，沒有人說完成，但也沒有人再提起。');
  let base; const pool=POOLS.find(p=>p[0].test(text)); base=(pool?pool[1]:DEF)[h%(pool?pool[1]:DEF).length];
  let add='';
  if((c.ext||0)>=2)add='本案歷經 '+c.ext+' 次展延。';
  else if((c.ver||0)>=4)add='全案共修改至第 '+c.ver+' 版。';
  else if((c.nnp||0)>=8)add='期間曾有 '+c.nnp+' 次週會沒有進度，終究還是走完了。';
  if(c.done===2)return(!PLC.includes(c.src)?'承辦人已不在線上，本案由本中心代為歸檔。':'本案久未更新，本中心依職權歸檔。若其實還活著，請來電認領。')+add;
  return base+add}
const cmOf=c=>((OV[c.id]&&OV[c.id].cm)||CM[c.id]||c.cm0||gen(c)).replace('{n}',c.stall||0);
/* ---------- rows ---------- */
function row(c){const[lv,cl]=level(c),m=metrics(c);
  const sub=[SRC[c.src],catOf(c),c.topic,c.kind,c.pic&&'承辦 '+c.pic,c.gd&&'設計 '+c.gd].filter(Boolean).join('｜');
  const dd=c.done&&c.closed?c.closed:c.due;
  return `<button class="case" data-id="${c.id}"><span class="no">${c.id}</span><span class="ttl"><b>${esc(c.desc)}</b><small>${esc(sub)}</small></span><span><span class="tag ${c.done===1?'grn':''}">${esc(c.status||'未填')}</span></span><span class="due ${m.late?'late':''}">${dd?md(dd):esc(c.duetxt||'未定')}</span><span class="cm"><span class="tags"><span class="tag ${cl}">${lv}</span>${tags(c).map(t=>`<span class="tag ${t[1]}">${t[0]}</span>`).join('')}</span>${esc(cmOf(c))}</span></button>`}
const HEAD='<div class="case head"><span>案號</span><span>案件</span><span>狀態</span><span>期限／結案</span><span>列管等級與本中心評語</span></div>';
const open=()=>cases.filter(c=>!c.done);
/* ---------- tooltip ---------- */
const tip=$('tip');
function showTip(e,html){tip.innerHTML=html;tip.hidden=false;const r=tip.getBoundingClientRect();let x=e.clientX+14,y=e.clientY+14;if(x+r.width>innerWidth-8)x=e.clientX-r.width-14;if(y+r.height>innerHeight-8)y=e.clientY-r.height-14;tip.style.left=Math.max(8,x)+'px';tip.style.top=Math.max(8,y)+'px'}
document.addEventListener('mousemove',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');if(t)showTip(e,t.dataset.tip);else if(!e.target.closest||!e.target.closest('.hov'))tip.hidden=true});
document.addEventListener('mouseleave',()=>tip.hidden=true);
/* ---------- charts ---------- */
const cv=n=>`var(${n})`;
const YRS=[];for(let y=Math.min(2023,+YR);y<=+YR;y++)YRS.push(String(y));
const nice=mx=>{const p=Math.pow(10,Math.floor(Math.log10(mx||1)));const n=mx/p;return(n<=1?1:n<=2?2:n<=5?5:10)*p};
function legend(el,names){$(el).innerHTML=names.map(n=>`<span><i style="background:${cv(COL[n])}"></i>${esc(SRC[n].replace('（歷史）',''))}</span>`).join('')}
function lineChart(){
  const el=$('c-line'),W=Math.max(320,el.clientWidth),H=250,L=34,R=12,T=10,B=24,ms=CH.months,n=ms.length;
  const mx=nice(Math.max(...PLC.flatMap(p=>CH.upd[p]))),x=i=>L+(W-L-R)*i/(n-1),y=v=>T+(H-T-B)*(1-v/mx);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="企劃每月更新次數折線圖">`;
  for(let k=0;k<=4;k++){const v=mx*k/4;s+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${cv('--grid')}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`}
  ms.forEach((m,i)=>{if(m.endsWith('-01'))s+=`<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H-B}" stroke="${cv('--grid')}"/><text x="${x(i)}" y="${H-7}" text-anchor="middle">${m.slice(0,4)}</text>`});
  PLC.forEach(p=>{let d='',pen=false;CH.upd[p].forEach((v,i)=>{const live=CH.npn[p][i][1]>0;if(!live){pen=false;return}d+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1);pen=true});s+=`<path d="${d}" fill="none" stroke="${cv(COL[p])}" stroke-width="2" stroke-linejoin="round"/>`});
  s+=`<line id="xh" y1="${T}" y2="${H-B}" stroke="${cv('--axis')}" hidden/><rect class="hov" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/></svg>`;
  el.innerHTML=s;const hov=el.querySelector('.hov'),xh=el.querySelector('#xh');
  hov.onmousemove=e=>{const r=hov.getBoundingClientRect(),i=Math.max(0,Math.min(n-1,Math.round((e.clientX-r.left)/r.width*(n-1))));xh.removeAttribute('hidden');xh.setAttribute('x1',x(i));xh.setAttribute('x2',x(i));
    showTip(e,`<b>${ms[i].replace('-','/')}</b><br>`+PLC.filter(p=>CH.npn[p][i][1]>0).map(p=>`<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${cv(COL[p])}"></i> ${p}：${CH.upd[p][i]} 筆`).join('<br>'))};
  hov.onmouseleave=()=>{xh.setAttribute('hidden','');tip.hidden=true}}
const heatFill=t=>t==null?cv('--heat0'):`color-mix(in oklab, ${cv('--heat')} ${Math.round(10+t*90)}%, ${cv('--heat0')})`;
function heatNP(){
  const el=$('c-heat'),W=Math.max(600,el.clientWidth),ms=CH.months,n=ms.length,L=64,T=18,cw=(W-L)/n,chh=26,H=T+chh*PLC.length+4;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="各企劃每月沒有進度比例熱點圖">`;
  ms.forEach((m,i)=>{if(m.endsWith('-01')||i===0)s+=`<text x="${L+cw*i}" y="11">${m.slice(0,4)}</text>`});
  PLC.forEach((p,r)=>{s+=`<text x="${L-8}" y="${T+chh*r+17}" text-anchor="end">${p}</text>`;
    ms.forEach((m,i)=>{const v=CH.np[p][i],[a,b]=CH.npn[p][i];s+=`<rect x="${(L+cw*i+1).toFixed(1)}" y="${T+chh*r+1}" width="${(cw-2).toFixed(1)}" height="${chh-2}" rx="3" fill="${heatFill(v)}" data-tip="${esc(`<b>${p}｜${m.replace('-','/')}</b><br>`+(b?`登錄 ${b} 筆，其中「沒有進度」${a} 筆`+(v!=null?`（${Math.round(v*100)}%）`:'，筆數太少不計比例'):'當月無登錄'))}"/>`})});
  el.innerHTML=s+'</svg>'}
function heatYM(){
  const el=$('c-ym'),W=Math.max(300,el.clientWidth),yrs=YRS,L=40,T=18,cw=(W-L)/12,chh=34,H=T+chh*4+4,mx=Math.max(...Object.values(CH.ym));
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="製作需求每月結案件數熱點圖">`;
  for(let m=1;m<=12;m++)s+=`<text x="${L+cw*(m-.5)}" y="11" text-anchor="middle">${m}月</text>`;
  yrs.forEach((yv,r)=>{s+=`<text x="${L-8}" y="${T+chh*r+21}" text-anchor="end">${yv}</text>`;
    for(let m=1;m<=12;m++){const k=yv+'-'+String(m).padStart(2,'0'),v=CH.ym[k];s+=`<rect x="${(L+cw*(m-1)+1).toFixed(1)}" y="${T+chh*r+1}" width="${(cw-2).toFixed(1)}" height="${chh-2}" rx="4" fill="${heatFill(v?v/mx:null)}" data-tip="${esc(`<b>${yv} 年 ${m} 月</b><br>結案 ${v||0} 件`)}"/>`;
      if(v&&cw>26)s+=`<text x="${L+cw*(m-.5)}" y="${T+chh*r+21}" text-anchor="middle" style="fill:${v/mx>.5?cv('--on'):cv('--text')};pointer-events:none">${v}</text>`}});
  el.innerHTML=s+'</svg>'}
function stacked(elId,labels,series,names,aria,lab){
  const el=$(elId),W=Math.max(300,el.clientWidth),H=230,L=34,R=6,T=10,B=24,n=labels.length,bw=(W-L-R)/n;
  const tot=labels.map((_,i)=>names.reduce((a,k)=>a+series[k][i],0)),mx=nice(Math.max(...tot)),y=v=>T+(H-T-B)*(1-v/mx);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}">`;
  for(let k=0;k<=4;k++){const v=mx*k/4;s+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${cv('--grid')}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`}
  labels.forEach((lb,i)=>{let acc=0;const t=`<b>${lb}</b>　合計 ${tot[i]}<br>`+names.filter(k=>series[k][i]).map(k=>`<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${cv(COL[k])}"></i> ${SRC[k].replace('（歷史）','')}：${series[k][i]}`).join('<br>');
    s+=`<g data-tip="${esc(t)}"><rect x="${L+bw*i}" y="${T}" width="${bw}" height="${H-T-B}" fill="transparent"/>`;
    names.forEach(k=>{const v=series[k][i];if(!v)return;const y1=y(acc+v),hh=y(acc)-y1;s+=`<rect x="${(L+bw*i+bw*.16).toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw*.68).toFixed(1)}" height="${Math.max(0,hh-2).toFixed(1)}" rx="2" fill="${cv(COL[k])}"/>`;acc+=v});
    s+='</g>';const t2=lab(lb,i);if(t2)s+=`<text x="${L+bw*(i+.5)}" y="${H-7}" text-anchor="middle">${t2}</text>`});
  el.innerHTML=s+'</svg>'}
function verChart(){
  const el=$('c-ver'),W=Math.max(300,el.clientWidth),H=230,L=34,R=6,T=18,B=24,d=CH.ver,n=d.length,bw=(W-L-R)/n,mx=nice(Math.max(...d.map(x=>x[1]))),y=v=>T+(H-T-B)*(1-v/mx);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="版本輪迴分佈長條圖">`;
  for(let k=0;k<=4;k++){const v=mx*k/4;s+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${cv('--grid')}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`}
  d.forEach((r,i)=>{s+=`<rect x="${(L+bw*i+bw*.18).toFixed(1)}" y="${y(r[1]).toFixed(1)}" width="${(bw*.64).toFixed(1)}" height="${(H-B-y(r[1])).toFixed(1)}" rx="4" fill="${cv('--acc')}" data-tip="${esc(`<b>最後停在 ${r[0]}</b><br>${r[1]} 案`)}"/><text x="${L+bw*(i+.5)}" y="${y(r[1])-5}" text-anchor="middle" style="fill:${cv('--text')}">${r[1]}</text><text x="${L+bw*(i+.5)}" y="${H-7}" text-anchor="middle">${r[0]}</text>`});
  el.innerHTML=s+'</svg>'}
let WK=[];
function wkChart(){const el=$('c-wk');if(!WK.length)return;const W=Math.max(260,el.clientWidth),H=210,L=6,R=6,T=20,B=22,n=WK.length,bw=(W-L-R)/n,mx=Math.max(...WK,1),y=v=>T+(H-T-B)*(1-v/mx);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近 8 週每週結案量長條圖"><line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" stroke="${cv('--axis')}"/>`;
  WK.forEach((v,i)=>{const last=i===n-1;s+=`<rect x="${(L+bw*i+bw*.2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw*.6).toFixed(1)}" height="${(H-B-y(v)).toFixed(1)}" rx="5" fill="${cv(last?'--acc':'--acc2')}" data-tip="${esc(`<b>${last?'本週':'前 '+(n-1-i)+' 週'}</b><br>結案 ${v} 案`)}"/><text x="${L+bw*(i+.5)}" y="${y(v)-5}" text-anchor="middle" style="fill:${cv('--text')};font-weight:700">${v}</text><text x="${L+bw*(i+.5)}" y="${H-6}" text-anchor="middle">${last?'本週':'W-'+(n-1-i)}</text>`});
  el.innerHTML=s+'</svg>'}
function hbars(el,rows,attr){const mx=Math.max(...rows.map(r=>r.v),1);$(el).innerHTML=rows.map(r=>{const inner=`<span>${esc(r.l)}${r.d||''}</span><i><u style="width:${r.v/mx*100}%"></u>${r.o?`<u class="o" style="width:${r.o/mx*100}%"></u>`:''}</i><em>${r.v}</em>`;return attr?`<button class="bar" ${attr}="${esc(r.k)}" data-tip="${esc(r.t||'')}">${inner}</button>`:`<div class="bar" data-tip="${esc(r.t||'')}">${inner}</div>`}).join('')}
function renderCharts(){
  legend('lg-line',PLC);lineChart();heatNP();
  legend('lg-q',MK);stacked('c-q',CH.q.labels,CH.q.series,MK,'製作需求每季結案量堆疊長條圖',(lb,i)=>lb.endsWith('Q1')||i===0?lb.slice(0,4):'');
  heatYM();verChart();wkChart();
  const yrs=YRS;
  const ser={P:yrs.map(y=>cases.filter(c=>c.g==='p'&&c.y===y).length),M:yrs.map(y=>cases.filter(c=>c.g==='m'&&c.y===y).length)};
  COL.P='--s1';COL.M='--s2';SRC.P='行銷企劃';SRC.M='多媒體設計與 MIS';
  $('lg-yr').innerHTML=['P','M'].map(n=>`<span><i style="background:${cv(COL[n])}"></i>${SRC[n]}</span>`).join('');
  stacked('c-yr',yrs,ser,['P','M'],'歷年案量堆疊長條圖',lb=>lb);
  hbars('byLang',CH.lang.slice(0,12).map(r=>({l:r[0],v:r[1],t:`<b>${r[0]}</b><br>${r[1]} 件`})));
  hbars('byGd',CH.gd.map(r=>({l:r[0],v:r[1],o:r[2],t:`<b>${r[0]}</b><br>${YR} 年 ${r[1]} 件，其中 ${r[2]} 件尚未結案`})));
  hbars('byEx',CH.ex.slice(0,10).map(r=>({l:r[0],v:r[1],t:`<b>${r[0]}</b><br>${r[1]} 件`})));
}
/* ---------- overview ---------- */
let F={grp:'all',src:'all',state:'open',yr:'',k:'',q:'',sort:'score',limit:60,flag:'',st:''};
function renderOverview(){
  const o=open(),late=o.filter(c=>metrics(c).late),soon=o.filter(c=>metrics(c).soon),c26=cases.filter(c=>c.done===1&&(c.closed||'').startsWith(YR));
  $('stats').innerHTML=[['列管中',o.length,'','open','',''],['已逾期｜照原訂期限 '+o.filter(c=>lateOrig(c,TODAY)).length,late.length,'hot','open','late',''],['7 日內到期',soon.length,'','open','soon',''],[YR+' 年結案',c26.length,'','done','',YR],['歷年總案量',cases.length.toLocaleString(),'','all','','']]
    .map(s=>`<button class="stat ${s[2]}" data-state="${s[3]}" data-flag="${s[4]}" data-yr="${s[5]}"><b>${s[1]}</b><span>${s[0]}</span></button>`).join('');
  const cnt=f=>[...o.reduce((m,c)=>m.set(f(c),(m.get(f(c))||0)+1),new Map())].sort((a,b)=>b[1]-a[1]);
  hbars('bySrc',cnt(c=>c.src).map(r=>({k:r[0],l:SRC[r[0]],v:r[1],t:`<b>${SRC[r[0]]}</b><br>列管中 ${r[1]} 件`})),'data-src');
  const stg=[...mStage(cases)].sort((a,b)=>b[1]-a[1]).slice(0,9),stgP=PREV&&mStage(PREV);
  hbars('byStatus',stg.map(r=>({k:r[0],l:r[0],v:r[1],d:stgP?dl(r[1],stgP.get(r[0])):'',t:`<b>${esc(r[0])}</b><br>${r[1]} 件`})),'data-st');
  const top=[...o].sort((a,b)=>score(b)-score(a)||(b.la||'').localeCompare(a.la||'')).slice(0,6);
  const li=(tg,cl,c,sub)=>`<li><span class="tag ${cl}">${tg}</span><span><a data-id="${c.id}">${esc(c.desc)}</a><br><small>${esc(sub)}</small></span></li>`;
  $('watch').innerHTML=top.map(c=>li(level(c)[0],level(c)[1],c,cmOf(c))).join('');
  const within=(d,n)=>d&&days(T0,D(d))<=n&&days(T0,D(d))>=-1;
  const nw=cases.filter(c=>within(c.req,7)),cl7=cases.filter(c=>c.done===1&&within(c.closed,7));
  $('newCount').textContent=DF?DF.new.length:nw.length;
  if(DF)$('newSub').textContent=`這次匯入比上次多出 ${DF.new.length} 案，同時結案 ${DF.closed.length} 案。`+(DF.new.length>DF.closed.length?'進大於出，本中心建議各位深呼吸。':'出大於進，本中心罕見地感到欣慰。');else $('newSub').textContent=nw.length>cl7.length?`同期結案 ${cl7.length} 案。進大於出，本中心建議各位深呼吸。`:`同期結案 ${cl7.length} 案。出大於進，本中心罕見地感到欣慰。`;
  const lead=(arr,f)=>[...arr.reduce((m,c)=>{const k=f(c);if(k)m.set(k,(m.get(k)||0)+1);return m},new Map())].sort((a,b)=>b[1]-a[1])[0];
  const lp=lead(cl7.filter(c=>c.g==='p'),c=>c.src),ld=lead(cl7.filter(c=>c.g==='m'),c=>(c.gd||'').split(' ')[0].replace(/^(TBD|-)$/,''));
  $('leaders').innerHTML=[['企','企劃結案最多',lp],['設','設計結案最多',ld]].map(r=>`<div class="leader"><i>${r[0]}</i><div><b>${r[2]?esc(r[2][0]):'從缺'}</b><small>${r[1]}${r[2]?'':'，本中心靜候佳音'}</small></div><em>${r[2]?r[2][1]+' 案':'—'}</em></div>`).join('');
  const dleft=c=>-days(T0,D(c.due));
  const urg=[...soon.sort((a,b)=>a.due.localeCompare(b.due)).slice(0,3),...late.sort((a,b)=>metrics(a).late-metrics(b).late).slice(0,3)];
  $('urgentSub').textContent=`7 日內到期 ${soon.length} 件、已逾期 ${late.length} 件`;
  $('urgent').innerHTML=urg.map(c=>metrics(c).late?li('逾期 '+metrics(c).late+' 日','red',c,cmOf(c)):li(dleft(c)<=0?'今日到期':dleft(c)+' 日後到期','pur',c,cmOf(c))).join('');
  $('follow').innerHTML=[...o].filter(c=>(c.stall||0)>=3).sort((a,b)=>b.stall-a.stall).slice(0,5).map(c=>li('無進度 '+c.stall+' 週','amb',c,cmOf(c))).join('')||'<li>目前沒有失聯案件，本中心不太習慣。</li>';
  const latest=c=>{const w=SHW[c.src];return w?hmap(c).get(w[0])||hmap(c).get(w[1]):null};
  const moving=cases.filter(c=>c.g==='p'&&!c.done&&latest(c)&&!NPR.test(latest(c)));
  if(DF)$('dyn').innerHTML=DF.closed.slice(0,3).map(x=>byId.get(x.id)?li('結案','grn',byId.get(x.id),SRC[x.src]+'｜'+(x.before||'未填')+' → '+(x.status||'結案')):'').concat(DF.status.slice(0,4).map(x=>byId.get(x.id)?li('進度','blu',byId.get(x.id),SRC[x.src]+'｜'+(x.before||'未填')+' → '+(x.status||'未填')):'')).join('');else $('dyn').innerHTML=[...cl7].sort((a,b)=>b.closed.localeCompare(a.closed)).slice(0,3).map(c=>li('結案','grn',c,SRC[c.src]+'｜'+md(c.closed)+' 結案')).concat(moving.slice(-3).reverse().map(c=>li('進度','blu',c,SRC[c.src]+'｜'+latest(c)))).join('');
  const wl=mWork(cases,DB),wlP=PREV&&mWork(PREV,BOOT.prev);
  hbars('work',PLC.map(p=>({l:p,v:wl[p].n,d:wlP?dl(wl[p].n,wlP[p].n):'',t:`<b>${p}</b><br>${wl[p].wk.replace(/-/g,'/')} 週會：${wl[p].n} 案有進度`+(wlP?`<br>上次（${wlP[p].wk.replace(/-/g,'/')}）：${wlP[p].n} 案`:'')})));
  if(DF){const nc=DF.new.map(x=>byId.get(x.id)).filter(Boolean).sort((a,b)=>(a.g+a.src).localeCompare(b.g+b.src));
    $('recentSub').textContent=`這次匯入新出現的案件，共 ${nc.length} 筆`;$('recent').style.cssText='max-height:340px;overflow-y:auto';
    $('recent').innerHTML=nc.map(c=>li('新增','blu',c,SRC[c.src]+'｜'+(c.status||'未填')+(c.due?'｜期限 '+md(c.due):''))).join('')||'<li>這次沒有新案件。</li>';
    const L={new:['新案件','blu'],closed:['結案','grn'],status:['狀態變動',''],extended:['期限延後','amb'],reopened:['重新列管','red'],missing:['Excel 裡不見了','red']};
    const row=(k,c)=>`<li>${c.id&&byId.has(c.id)?`<a class="lnk" data-id="${c.id}">${esc(c.desc)}</a>`:esc(c.desc)} <small>${esc(SRC[c.src]||c.src)}${k==='status'||k==='closed'||k==='reopened'?`｜${esc(c.before||'未填')} → ${esc(c.status||'未填')}`:k==='extended'?`｜${md(c.before)} → ${md(c.after)}`:c.status?'｜'+esc(c.status):''}</small></li>`;
    $('diffCard').hidden=false;$('diffCard').innerHTML=`<h2>本週異動公報</h2><p class="sub">上次匯入（基準日 ${md(BOOT.prev.today)}）到這次（基準日 ${md(TODAY)}）之間的差異。圖表上的 ▲▼ 也是和上次相比。</p><div class="dstats">${Object.keys(L).map(k=>`<span class="tag ${L[k][1]}">${L[k][0]} ${DF[k].length}</span>`).join('')}<span class="tag">合計 ${cases.length.toLocaleString()} 案</span></div>`+Object.keys(L).filter(k=>DF[k].length).map(k=>`<details class="dsec"><summary>${L[k][0]}（${DF[k].length}）</summary><ul class="dlist">${DF[k].map(c=>row(k,c)).join('')}</ul></details>`).join('')}
  else $('recent').innerHTML=[...cases].filter(c=>c.req).sort((a,b)=>b.req.localeCompare(a.req)).slice(0,4).map(c=>li('新增','blu',c,SRC[c.src]+'｜'+md(c.req)+' 成立'+(c.due?'，期限 '+md(c.due):''))).join('');
  $('focus').innerHTML=moving.filter(c=>/project|40th|ces|video/i.test(c.topic||'')).concat(moving).filter((c,i,a)=>a.indexOf(c)===i).slice(0,5).map(c=>`<button class="spot" data-id="${c.id}"><span class="star">✦</span><span><b>${esc(c.desc)}</b><small>${esc(latest(c))}｜${esc(cmOf(c))}</small></span></button>`).join('');
  WK=Array.from({length:8},(_,i)=>{const hi=(7-i)*7,lo=hi+7;return cases.filter(c=>c.done===1&&c.closed&&days(T0,D(c.closed))<lo-1&&days(T0,D(c.closed))>=hi-1).length});
  const pick=(arr,f)=>[...arr].sort((a,b)=>f(b)-f(a))[0];
  const a=pick(late,c=>metrics(c).late),b=pick(o,c=>c.stall||0),e=pick(o,c=>c.ext||0),v=pick(o,c=>c.ver||0);
  const wk=cases.filter(c=>c.done===1&&c.closed&&days(T0,D(c.closed))<=7&&days(T0,D(c.closed))>=-1).length;
  const n=[];
  if(a)n.push(['red','逾期',`「${a.desc}」已逾期 ${metrics(a).late} 日，榮登本中心逾期排行榜首位。`,a.id]);
  if(b&&b.stall>=3)n.push(['amb','失聯',`「${b.desc}」已連續 ${b.stall} 週沒有進度，本中心呼籲知情人士出面說明。`,b.id]);
  if(v&&v.ver>=4)n.push(['pur','輪迴',`「${v.desc}」已修改至第 ${v.ver} 版，為現役最高紀錄。`,v.id]);
  if(e&&e.ext)n.push(['amb','展延',`「${e.desc}」累計展延 ${e.ext} 次，原訂期限為 ${md(e.due0)}。`,e.id]);
  n.push(['grn','結案',`近 7 日共有 ${wk} 案結案，本中心謹代表全體案件表示感謝。`,null]);
  n.push(['blu','統計',`列管中 ${o.length} 案，其中 ${o.filter(c=>metrics(c).wait).length} 案正在等別人。本中心也在等。`,null]);
  $('notice').innerHTML=n.map(x=>`<li><span class="tag ${x[0]}">${x[1]}</span><span>${esc(x[2])}${x[3]?` <a data-id="${x[3]}">調閱</a>`:''}</span></li>`).join('');
  $('gfCharts').innerHTML=GF().filter(f=>f.type==='select').map(f=>`<div class="card"><h2>依「${esc(f.name)}」</h2><p class="sub">自訂欄位統計，全部案件</p><div class="bars" id="gf-${f.k}"></div></div>`).join('');
  $('gfCharts').hidden=!$('gfCharts').innerHTML;
  GF().filter(f=>f.type==='select').forEach(f=>{const m=new Map();cases.forEach(c=>{const v=((OV[c.id]||{}).fv||{})[f.k];if(v)m.set(v,(m.get(v)||0)+1)});
    if(m.size)hbars('gf-'+f.k,[...m].sort((a,b)=>b[1]-a[1]).map(r=>({l:r[0],v:r[1],t:`<b>${esc(r[0])}</b><br>${r[1]} 案`})));else $('gf-'+f.k).innerHTML='<span style="color:var(--muted);font-size:13px">還沒有案件填寫這一欄。到任一案件內頁選擇後，這裡會出現統計。</span>'});

}
/* ---------- cases ---------- */
function chips(el,items,cur,attr){$(el).innerHTML=items.map(i=>`<button class="chip" ${attr}="${i[0]}" aria-pressed="${i[0]===cur}">${i[1]}</button>`).join('')}
function filtered(){
  const q=F.q.trim().toLowerCase();
  let r=cases.filter(c=>(F.grp==='all'||DEPT(c)===F.grp)&&(F.src==='all'||c.src===F.src)&&(F.state==='all'||(F.state==='open')===!c.done)&&(!F.yr||c.y===F.yr)&&(!F.k||catOf(c)===F.k)&&(!F.st||c.status===F.st)
    &&(!F.flag||(F.flag==='late'?metrics(c).late:metrics(c).soon))
    &&(!q||[c.id,c.desc,c.sku,c.topic,c.cat,c.kind,c.pic,c.gd,c.src,c.status,cmOf(c),...Object.values((OV[c.id]||{}).fv||{})].join(' ').toLowerCase().includes(q)));
  const big='9999';
  if(F.sort==='score')r.sort((a,b)=>score(b)-score(a)||((b.closed||b.due||'')).localeCompare(a.closed||a.due||''));
  else if(F.sort==='due')r.sort((a,b)=>((a.done?a.closed:a.due)||big).localeCompare((b.done?b.closed:b.due)||big)*(F.state==='open'?1:-1));
  else r.sort((a,b)=>(b.req||b.closed||b.due||'').localeCompare(a.req||a.closed||a.due||''));
  return r}
function renderCases(){
  chips('grpChips',[['all','全部'],['plan','行銷企劃'],['mm','多媒體設計'],['mis','MIS']],F.grp,'data-grp');
  const subs=F.grp==='plan'?PL:F.grp==='mm'?['Design','Video','UI']:F.grp==='mis'?['Coding','Support']:[...PL,'Design','Video','UI','Coding','Support'];
  chips('srcChips',[['all','全部單位'],...subs.map(k=>[k,SRCL[k]||SRC[k]])],F.src,'data-src');
  chips('stateChips',[['open','列管中'],['done','已結案／歸檔'],['all','全部']],F.state,'data-state');
  $('yrSel').value=F.yr;
  const r=filtered(),extra=[F.st&&'狀態「'+F.st+'」',F.flag==='late'&&'已逾期',F.flag==='soon'&&'7 日內到期'].filter(Boolean);
  $('count').className=extra.length?'tag amb':'tag';
  $('count').innerHTML=`共 ${r.length.toLocaleString()} 案`+(extra.length?`｜只顯示：${esc(extra.join('、'))} <a class="lnk" id="clr">清除這個篩選</a>`:'');
  $('list').innerHTML=r.length?HEAD+r.slice(0,F.limit).map(row).join(''):'<div class="empty">查無符合條件的案件。本中心對此結果表示尊重。</div>';
  $('moreBtn').hidden=r.length<=F.limit}
/* ---------- weekly ---------- */
let W={pl:PLC[0],wk:null,mode:'official'};

function report(){
  const wi=W.wk,date=WEEKS[wi],rec=(SUMS[W.pl]||{})[wi],mine=cases.filter(c=>c.src===W.pl);
  const st=c=>hmap(c).get(wi);
  const line=c=>`・[${c.topic||'General'}] ${c.desc}：${st(c)||c.status}`+(c.due?`（期限 ${md(c.due)}）`:'');
  const done=mine.filter(c=>isDone(st(c))),prog=mine.filter(c=>st(c)&&!NPR.test(st(c))&&!isDone(st(c)));
  const d0=D(date),next=mine.filter(c=>{if(!c.due||isDone(st(c)))return false;const k=days(D(c.due),d0);return k>=1&&k<=8&&(st(c)||!c.done)});
  const stuck=mine.filter(c=>{const s=st(c);return s&&NPR.test(s)});
  const has=rec&&rec.some(Boolean);
  const A=has&&rec[0]?rec[0]:(done.map(line).join('\n')||'・無'),B=has&&rec[1]?rec[1]:(prog.map(line).join('\n')||'・無'),C=has&&rec[2]?rec[2]:(next.map(line).join('\n')||'・無');
  const src=has?'依當週登錄內容':'當週未填寫摘要，由本中心依案件狀態彙整';
  if(W.mode==='plain')return`${W.pl} 週報 ${date.replace(/-/g,'/')}\n\n本週完成項目\n${A}\n\n本週進度項目\n${B}\n\n下週預計完成項目\n${C}`;
  return`行銷案件生命跡象觀測中心 週報\n承辦：${W.pl}　週會日期：${date.replace(/-/g,'/')}\n資料來源：${src}\n\n一、本週完成項目（本中心予以嘉許）\n${A}\n\n二、本週進度項目\n${B}\n\n三、下週預計完成項目（「預計」二字請自行斟酌）\n${C}\n\n四、本中心關切事項\n${stuck.length?`・當週共 ${stuck.length} 案登錄為沒有進度`+(stuck.length?'，例如：'+stuck.slice(0,3).map(c=>c.desc).join('、')+'。':''):'・無。本中心感到不太習慣。'}\n\n以上，敬請 鑒核。`}
function renderWeekly(){
  chips('plChips',PLC.map(p=>[p,p]),W.pl,'data-pl');chips('modeChips',[['official','官方模式'],['plain','正經模式']],W.mode,'data-mode');
  const ws=SHW[W.pl]; if(W.wk==null||!ws.includes(W.wk))W.wk=ws[0];
  $('wkSel').innerHTML=ws.map(i=>`<option value="${i}" ${i===W.wk?'selected':''}>${WEEKS[i].replace(/-/g,'/')}</option>`).join('');
  $('report').textContent=report();
  const cls=h=>!h||NPR.test(h)?'':isDone(h)?'d':WAIT_RE.test(h)?'wt':'p';
  const act=cases.filter(c=>c.src===W.pl&&!c.done).sort((a,b)=>(a.due||'9').localeCompare(b.due||'9'));
  $('mineTitle').textContent=`${W.pl} 列管中案件（${act.length}）`;
  $('mine').innerHTML=act.length?act.map(c=>{const m=metrics(c),hm=hmap(c);
    return`<button class="case" data-id="${c.id}"><span class="no">${c.id}</span><span class="ttl"><b>${esc(c.desc)}</b><small>${esc(c.topic||'')}</small></span><span><span class="tag">${esc(c.status)}</span></span><span class="due ${m.late?'late':''}">${c.due?md(c.due):esc(c.duetxt||'未定')}</span><span class="cm"><span class="hist">${ws.slice(0,14).map(i=>`<i class="${cls(hm.get(i))}" data-tip="${esc(WEEKS[i]+'：'+(hm.get(i)||'未登錄'))}"></i>`).join('')}</span></span></button>`}).join(''):'<div class="empty">此承辦人目前沒有列管中案件，歷史案件請至案件清冊查閱。</div>'}
/* ---------- detail ---------- */
function timeline(c){
  let out=(c.ul||[]).map(l=>`<li><time>${md(TODAY)}</time>${esc(l)}</li>`).join('');
  if(c.h){let run=0,last='';const flush=()=>{if(run)out+=`<li class="q"><time>${last}</time>連續 ${run} 次週會沒有進度</li>`;run=0};
    for(let i=0;i<c.h.length;i+=2){const s=VOC[c.h[i+1]],d=WEEKS[c.h[i]].slice(2).replace(/-/g,'/');if(NPR.test(s)){run++;last=d}else{flush();out+=`<li><time>${d}</time>${esc(s)}</li>`}}flush()}
  out+=(c.log||[]).map(l=>`<li>${esc(l)}</li>`).join('');
  return out?`<ul class="tl">${out}</ul>`:'<span style="color:var(--muted)">尚無紀錄。</span>'}
function family(c){
  const li=(x,act)=>`<li><span class="tag ${level(x)[1]}">${level(x)[0]}</span><a class="lnk" data-id="${x.id}">${esc(x.desc)}</a><span class="tag">${esc(SRC[x.src])}｜${esc(x.status||'未填')}</span>${act}</li>`;
  if(c.g==='p'){const ks=kids(c.id),sg=suggest(c);let who='';
    if(ks.length&&!c.done){const o=ks.filter(k=>!k.done);who=`<li class="who">${o.length?'母案：'+(c.status||'未填')+'｜子案未結：'+o.map(k=>`${SRC[k.src]}（${k.status||'未填'}）`).join('、'):'子案皆已結案，只剩母案本身：'+(c.status||'未填')}</li>`}
    const up=OV[c.id]&&OV[c.id].p&&byId.get(OV[c.id].p),sib=(!up&&!ks.some(k=>k.g==='p'))?cases.filter(x=>x.g==='p'&&x.src===c.src&&x.id!==c.id&&!(OV[x.id]&&OV[x.id].p)).map(x=>[sim(c,x),x]).filter(r=>r[0]>=.62).sort((a,b)=>b[0]-a[0]).slice(0,3).map(r=>r[1]):[];
    const upH=up?`<div><h4>上層專案</h4><ul class="fam">${li(up,`<a class="lnk adm" data-unlink="${c.id}">解除</a>`)}</ul></div>`:sib.length?`<div class="adm"><h4>同系列企劃案（可以收進同一個大專案）</h4><ul class="fam">${sib.map(x=>li(x,`<button class="btn sm" data-link="${c.id}" data-to="${x.id}">掛到這案底下</button>`)).join('')}</ul></div>`:'';
    return upH+`<div><h4>子案${ks.length?' '+ks.length+' 件':''}</h4><ul class="fam">${who}${ks.map(k=>li(k,`<a class="lnk adm" data-unlink="${k.id}">解除</a>`)).join('')||'<li style="color:var(--muted)">尚未連結子案。</li>'}</ul>${sg.length?`<div class="adm" style="margin-top:10px"><h4>建議配對（名稱相近，由你確認）</h4><ul class="fam">${sg.map(k=>li(k,`<button class="btn sm" data-link="${k.id}" data-to="${c.id}">連成子案</button>`)).join('')}</ul></div>`:''}</div>`}
  const p=OV[c.id]&&OV[c.id].p&&byId.get(OV[c.id].p),sg=p?[]:suggest(c);
  return`<div><h4>母案（企劃端）</h4><ul class="fam">${p?li(p,`<a class="lnk adm" data-unlink="${c.id}">解除</a>`):'<li style="color:var(--muted)">尚未連結母案。</li>'}</ul>${sg.length?`<div class="adm" style="margin-top:10px"><h4>建議配對（名稱相近，由你確認）</h4><ul class="fam">${sg.map(k=>li(k,`<button class="btn sm" data-link="${c.id}" data-to="${k.id}">設為母案</button>`)).join('')}</ul></div>`:''}</div>`}
function openCase(id){
  const c=byId.get(id);if(!c)return;const[lv,cl]=level(c),o=OV[id]||{},fv=o.fv||{};
  const meta=[['管轄單位',SRCL[c.src]||SRC[c.src]],['共用分類',catOf(c)],['原始分類／主題',c.topic],['製作分類',c.cat],['種類',c.kind],['語言',c.lang],['品號',c.sku],['承辦／需求者',c.pic],['設計師',c.gd],['起始日',c.req&&md(c.req)],['第一版',c.fv&&md(c.fv)],['原訂期限',c.ext?md(c.due0):null],['期限',c.due?md(c.due):c.duetxt],['結案日',c.closed&&md(c.closed)],['狀態',c.status],['週會登錄次數',c.nup]].filter(m=>m[1]&&m[1]!=='-');
  const notes=o.n||[],dis=VIEW?'disabled':'';
  const ctl=f=>f.type==='select'?`<select data-gf="${f.k}" ${dis}><option value="">未填</option>${f.opts.map(x=>`<option ${fv[f.k]===x?'selected':''}>${esc(x)}</option>`).join('')}</select>`:`<input data-gf="${f.k}" type="${f.type==='date'?'date':'text'}" value="${esc(fv[f.k]||'')}" ${dis}>`;
  $('dlg').innerHTML=`<div class="dh"><div><span class="no">列管字第 ${c.id} 號</span><h3>${esc(c.desc)}</h3></div><button class="x" data-close>關閉</button></div>
  <div class="db">
    <div class="tags"><span class="tag ${cl}">${lv}</span>${tags(c).map(t=>`<span class="tag ${t[1]}">${t[0]}</span>`).join('')}</div>
    <div class="verdict"><small>本中心評語${o.cm?'（管理者改寫）':''}</small><p id="cmText">${esc(cmOf(c))}</p>
      <form class="form" id="cmForm" hidden><textarea id="cmEdit" aria-label="評語"></textarea><div class="row"><button class="btn grad sm" type="submit">儲存評語</button><button class="btn sm" type="button" id="cmReset">還原本中心版本</button></div></form>
      <div class="adm"><button class="btn sm" id="cmBtn">改寫評語</button></div></div>
    <dl class="meta">${meta.map(m=>`<div><dt>${m[0]}</dt><dd>${esc(m[1])}</dd></div>`).join('')}</dl>
    ${flowHTML(c)}
    ${GF().length?`<div class="form"><h4 style="margin:0">自訂欄位（全站共用）</h4><div class="row">${GF().map(f=>`<label>${esc(f.name)}${ctl(f)}</label>`).join('')}</div></div>`:''}
    ${family(c)}
    <div><h4>進度紀錄</h4>${timeline(c)}</div>
    <div class="adm"><h4>結案判定</h4><div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="tag">${c.manual?'目前是管理者判定':'目前依 Excel 判定'}：${c.done?'已結案':'列管中'}</span>${c.done?`<button class="btn sm" data-dn="0">改回列管中</button>`:`<button class="btn sm" data-dn="1">標為結案</button>`}${c.manual?`<button class="btn sm" data-dn="x">還原成 Excel 的判定</button>`:''}</div></div>
    <div><h4>管理者備註（${notes.length}）</h4>${notes.length?`<ul class="tl">${notes.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:'<span style="color:var(--muted)">尚無備註。</span>'}</div>
    <form class="form adm" id="nForm"><div class="row"><input id="n-text" aria-label="備註" placeholder="寫一句備註" style="flex:3 1 220px" required><button class="btn sm" type="submit">送出</button></div></form>
  </div>`;
  const dlg=$('dlg');if(!dlg.open)dlg.showModal();dlg.scrollTop=0;drawFlow(c);
  $('cmBtn').onclick=()=>{$('cmForm').hidden=false;$('cmBtn').hidden=true;$('cmEdit').value=cmOf(c);$('cmEdit').focus()};
  $('cmForm').onsubmit=e=>{e.preventDefault();const t=$('cmEdit').value.trim();if(t)ov(id).cm=t;else delete ov(id).cm;save();renderAll();openCase(id)};
  $('cmReset').onclick=()=>{delete ov(id).cm;save();renderAll();openCase(id)};
  dlg.querySelectorAll('[data-gf]').forEach(el=>el.onchange=()=>{const fvv=ov(id).fv=ov(id).fv||{};if(el.value)fvv[el.dataset.gf]=el.value;else delete fvv[el.dataset.gf];save();renderOverview()});
  dlg.querySelectorAll('[data-link]').forEach(el=>el.onclick=()=>{ov(el.dataset.link).p=el.dataset.to;save();relink();renderAll();openCase(id)});
  dlg.querySelectorAll('[data-unlink]').forEach(el=>el.onclick=()=>{delete ov(el.dataset.unlink).p;save();relink();renderAll();openCase(id)});
  $('nForm').onsubmit=e=>{e.preventDefault();(ov(id).n=ov(id).n||[]).unshift(md(TODAY)+' '+BOOT.user+'：'+$('n-text').value.trim());save();openCase(id)};
  dlg.querySelectorAll('[data-dn]').forEach(el=>el.onclick=()=>{if(el.dataset.dn==='x')delete ov(id).dn;else ov(id).dn=+el.dataset.dn;clearTimeout(saveT);putState().then(()=>location.reload())});}
function renderFields(){renderCatMap();
  $('fList').innerHTML=GF().map((f,i)=>`<li><b>${esc(f.name)}</b><span class="tag">${f.type==='select'?'下拉選單：'+esc(f.opts.join('、')):f.type==='date'?'日期':'文字'}</span><a class="lnk" data-delgf="${i}">刪除</a></li>`).join('')||'<li style="color:var(--muted)">目前沒有自訂欄位。</li>';
  $('fList').querySelectorAll('[data-delgf]').forEach(a=>a.onclick=()=>{GF().splice(+a.dataset.delgf,1);save();renderFields();renderOverview()})}
$('fBtn').onclick=()=>{renderFields();$('fDlg').showModal()};
function renderCatMap(){const m=new Map();cases.forEach(c=>{if(c.g==='p'){const r=rawCat(c);m.set(r,(m.get(r)||0)+1)}});
  $('catMap').innerHTML=[...m].sort((a,b)=>b[1]-a[1]).slice(0,80).map(([r,n])=>{const cur=catOf({topic:r==='（未填）'?'':r,desc:''});return`<span>${esc(r)} <small>${n} 案</small></span><select data-raw="${esc(r)}" aria-label="${esc(r)} 的共用分類">${CATS.map(k=>`<option ${k===cur?'selected':''}>${k}</option>`).join('')}</select>`}).join('');
  $('catMap').querySelectorAll('select').forEach(s=>s.onchange=()=>{(OV._catmap=OV._catmap||{})[s.dataset.raw]=s.value;save();renderAll()})}
function pairs(){const out=[],mk=cases.filter(c=>c.g==='m'&&!(OV[c.id]&&OV[c.id].p)&&(c.yr===+YR||!c.done));
  cases.filter(c=>c.g==='p'&&PLC.includes(c.src)&&(c.y>=YR||!c.done)).forEach(p=>{const a=p.req||p.due,b=p.closed||TODAY,nm=p.src.toLowerCase();
    mk.forEach(k=>{if(k.pic&&!k.pic.toLowerCase().includes(nm))return;const kd=k.req||k.closed||k.due;if(a&&kd&&(days(D(kd),D(a))<-45||days(D(kd),D(b))>45))return;const s=sim(p,k);if(s>=.7){const A=big(p),B=big(k);let n=0;for(const x of A)if(B.has(x))n++;out.push([s,p,k,n/(A.size+B.size-n)])}})});
  const best=new Map();out.forEach(r=>{const cur=best.get(r[2].id);if(!cur||r[0]>cur[0])best.set(r[2].id,r)});return[...best.values()].sort((x,y)=>y[0]-x[0]).slice(0,200)}
const pairCount=()=>{$('pairN').textContent='已勾選 '+$('pairList').querySelectorAll('input:checked').length+' 筆'};
$('pairBtn').onclick=()=>{const ps=pairs();$('pairList').innerHTML=ps.length?ps.sort((x,y)=>y[3]-x[3]).map(([s0,p,k,s])=>`<label class="pr"><input type="checkbox" data-c="${k.id}" data-p="${p.id}" ${s>=.8?'checked':''}><span><b>${esc(k.desc)}</b><small>${esc(SRC[k.src])}｜${esc(k.status||'未填')}｜${md(k.req||k.closed||k.due)}</small><small>→ 掛到：${esc(p.desc)}（${esc(p.src)}）</small></span><span class="tag ${s>=.8?'grn':'amb'}">${Math.round(Math.min(1,s)*100)}%</span></label>`).join(''):'<div class="empty">目前沒有新的配對建議。</div>';
  $('pairList').onchange=pairCount;pairCount();$('pairDlg').showModal()};
$('pairAll').onclick=()=>{$('pairList').querySelectorAll('input').forEach(i=>i.checked=true);pairCount()};
$('pairNone').onclick=()=>{$('pairList').querySelectorAll('input').forEach(i=>i.checked=false);pairCount()};
$('pairGo').onclick=()=>{$('pairList').querySelectorAll('input:checked').forEach(i=>{ov(i.dataset.c).p=i.dataset.p});save();relink();renderAll();$('pairDlg').close()};
let reqLim=40;
function renderReq(){const a=cases.filter(c=>c.src==='Design'&&(!c.req||(OV[c.id]&&OV[c.id].req))&&(c.yr===+YR||!c.done)).sort((x,y)=>((OV[y.id]&&OV[y.id].p?2:0)+(y.done?0:1))-((OV[x.id]&&OV[x.id].p?2:0)+(x.done?0:1))||(y.closed||y.due||'').localeCompare(x.closed||x.due||''));
  $('reqList').innerHTML=a.slice(0,reqLim).map(c=>`<div class="pr"><span class="tag ${c.done?'grn':'blu'}">${OV[c.id]&&OV[c.id].p?'已連結':c.done?'已結案':'進行中'}</span><span><b><a class="lnk" data-id="${c.id}">${esc(c.desc)}</a></b><small>${c.id}｜設計 ${esc(c.gd||'未定')}｜承辦 ${esc(c.pic||'未填')}｜${c.done?'結案 '+md(c.closed):'期限 '+md(c.due)}</small></span><input type="date" data-req="${c.id}" value="${c.req||''}" max="${TODAY}" aria-label="開單日"></div>`).join('');
  $('reqMore').hidden=a.length<=reqLim;
  $('reqList').querySelectorAll('[data-req]').forEach(i=>i.onchange=()=>{const c=byId.get(i.dataset.req);if(i.value){ov(c.id).req=i.value;c.req=i.value}else{delete ov(c.id).req;delete c.req}save();renderPipeline()})}
$('reqBtn').onclick=()=>{reqLim=40;renderReq();$('reqDlg').showModal()};
$('reqMore').onclick=()=>{reqLim+=60;renderReq()};
$('fAdd').onsubmit=e=>{e.preventDefault();const type=$('fa-type').value,opts=$('fa-opts').value.split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
  GF().push({k:'f'+Date.now().toString(36),name:$('fa-name').value.trim(),type:type==='select'&&!opts.length?'text':type,opts});save();e.target.reset();renderFields();renderOverview()};
$('roleBtn').onclick=()=>{VIEW=!VIEW;document.body.classList.toggle('viewer',VIEW);setTimeout(renderCharts,0);$('roleBtn').textContent=VIEW?'身分：訪客（唯讀預覽）':'身分：管理者';$('roleBtn').setAttribute('aria-pressed',VIEW)};
/* ---------- 企劃頁：一次掌握每位企劃手上的案件 ---------- */
let PV={pl:null,sort:'risk'};
const histCls=h=>!h||NPR.test(h)?'':isDone(h)?'d':WAIT_RE.test(h)?'wt':'p';
const lateAt=(c,today)=>!c.done&&c.due&&!HOLD.test(c.status||'')?Math.max(0,days(D(today),D(c.due))):0;
const lateOrig=(c,today)=>!c.done&&c.due0&&!HOLD.test(c.status||'')?Math.max(0,days(D(today),D(c.due0))):lateAt(c,today);
const soonAt=(c,today)=>{if(c.done||!c.due||HOLD.test(c.status||''))return false;const d=days(D(c.due),D(today));return d>=0&&d<=7};
const stageNow=c=>stageOf(c.status)||'plan';
function planStats(list,db,today,p){const op=list.filter(c=>c.src===p&&!c.done),wi=(db.shw[p]||[])[0],mv=c=>{const s=hmap(c).get(wi);return s&&!NPR.test(s)};
  return{open:op.length,late:op.filter(c=>lateAt(c,today)).length,lateO:op.filter(c=>lateOrig(c,today)).length,pushed:op.filter(c=>c.ext).length,soon:op.filter(c=>soonAt(c,today)).length,stall:op.filter(c=>(c.stall||0)>=2).length,moved:op.filter(mv).length,hand:op.filter(c=>['plan','queue'].includes(stageNow(c))).length}}
function renderPlan(){
  if(BOOT.role!=='admin')return;if(!PV.pl||!PLC.includes(PV.pl))PV.pl=PLC[0];
  const st=Object.fromEntries(PLC.map(p=>[p,planStats(cases,DB,TODAY,p)])),sp=PREV&&Object.fromEntries(PLC.map(p=>[p,planStats(PREV,BOOT.prev,BOOT.prev.today,p)]));
  const dn=k=>p=>DF?DF[k].filter(x=>x.src===p).length:null;
  const saved=p=>DF?DF.extended.filter(x=>x.src===p&&x.before<TODAY&&byId.has(x.id)&&!byId.get(x.id).done).length:null;
  const rows=[['列管中',p=>st[p].open,p=>sp&&sp[p].open],['已逾期（照現在的期限）',p=>st[p].late,p=>sp&&sp[p].late],['已逾期（照原訂期限）',p=>st[p].lateO,p=>sp&&sp[p].lateO],['期限延後過的案件',p=>st[p].pushed,p=>sp&&sp[p].pushed],['這次靠延後解除逾期',saved],['7 日內到期',p=>st[p].soon,p=>sp&&sp[p].soon],['沒有進度 2 週以上',p=>st[p].stall,p=>sp&&sp[p].stall],['最近一次週會有進度',p=>st[p].moved,p=>sp&&sp[p].moved],['在自己手上（企劃作業、已接收未開始）',p=>st[p].hand,p=>sp&&sp[p].hand],['這次匯入新增',dn('new')],['這次匯入結案',dn('closed')],['這次匯入期限延後',dn('extended')]];
  $('planCmp').innerHTML=`<table class="ft"><thead><tr><th></th>${PLC.map(p=>`<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td>${PLC.map(p=>{const v=r[1](p);return`<td class="n">${v===null?'—':v+(r[2]&&sp?dl(v,r[2](p)):'')}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  chips('pvChips',PLC.map(p=>[p,p]),PV.pl,'data-pv');
  const p=PV.pl,s=st[p],q=sp&&sp[p],op=cases.filter(c=>c.src===p&&!c.done);
  $('planStats').innerHTML=[['列管中',s.open,q&&q.open,''],['已逾期',s.late,q&&q.late,'hot'],['照原訂期限逾期',s.lateO,q&&q.lateO,''],['7 日內到期',s.soon,q&&q.soon,''],['沒有進度 2 週以上',s.stall,q&&q.stall,''],['這次新增',DF?dn('new')(p):'—',null,''],['這次結案',DF?dn('closed')(p):'—',null,'']].map(x=>`<div class="stat ${x[3]}" style="cursor:default"><b>${x[1]}</b><span>${x[0]}${x[2]!==null&&x[2]!==undefined&&q?dl(x[1],x[2]):''}</span></div>`).join('');
  const SGN=STG.filter(g=>g[0]!=='done'),cnt={};op.forEach(c=>{const k=stageNow(c);cnt[k]=(cnt[k]||0)+1});
  $('planStage').innerHTML=SGN.filter(g=>cnt[g[0]]).map(g=>`<span style="flex:${cnt[g[0]]};background:var(${g[2]})" data-tip="${esc(`<b>${g[1]}</b><br>${cnt[g[0]]} 案`)}"></span>`).join('');
  $('planStageLg').innerHTML=SGN.filter(g=>cnt[g[0]]).map(g=>`<span><i style="background:var(${g[2]})"></i>${g[1]} ${cnt[g[0]]}</span>`).join('');
  $('planHandSub').textContent=`${p} 列管中 ${s.open} 案：在自己手上 ${s.hand} 案，其餘 ${s.open-s.hand} 案在等設計、Coding 或對方回覆。依目前狀態的文字判讀。`;
  const cm=new Map();op.forEach(c=>cm.set(catOf(c),(cm.get(catOf(c))||0)+1));
  hbars('planCat',[...cm].sort((a,b)=>b[1]-a[1]).map(r=>({l:r[0],v:r[1],t:`<b>${r[0]}</b><br>${r[1]} 案`})));
  const ws=(DB.shw[p]||[]).slice(0,12).reverse(),mine=cases.filter(c=>c.src===p),vals=ws.map(wi=>mine.filter(c=>{const x=hmap(c).get(wi);return x&&!NPR.test(x)}).length);
  {const el=$('planWk'),W=Math.max(240,el.clientWidth),H=180,L=6,R=6,T=20,B=22,n=vals.length||1,bw=(W-L-R)/n,mx=Math.max(...vals,1),y=v=>T+(H-T-B)*(1-v/mx);
    let g=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p)} 近 12 次週會有進度的案件數"><line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" stroke="${cv('--axis')}"/>`;
    vals.forEach((v,i)=>{const last=i===n-1,wk=WEEKS[ws[i]];g+=`<rect x="${(L+bw*i+bw*.2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw*.6).toFixed(1)}" height="${(H-B-y(v)).toFixed(1)}" rx="4" fill="${cv(last?'--acc':'--acc2')}" data-tip="${esc(`<b>${wk.replace(/-/g,'/')} 週會</b><br>${v} 案有進度`)}"/><text x="${L+bw*(i+.5)}" y="${y(v)-5}" text-anchor="middle" style="fill:${cv('--text')};font-weight:700">${v}</text>`+(i%2===(n-1)%2?`<text x="${L+bw*(i+.5)}" y="${H-6}" text-anchor="middle">${+wk.slice(5,7)}/${+wk.slice(8)}</text>`:'')});
    el.innerHTML=g+'</svg>'}
  const isNew=new Set(DF?DF.new.map(x=>x.id):[]),chg=new Map(DF?DF.status.map(x=>[x.id,x.before]):[]),ext=new Map(DF?DF.extended.map(x=>[x.id,[x.before,x.after]]):[]);
  const moved=c=>isNew.has(c.id)||chg.has(c.id)||ext.has(c.id)?1:0;
  const sorters={risk:(a,b)=>lateAt(b,TODAY)-lateAt(a,TODAY)||(b.stall||0)-(a.stall||0)||(a.due||'9').localeCompare(b.due||'9'),due:(a,b)=>(a.due||'9').localeCompare(b.due||'9'),stall:(a,b)=>(b.stall||0)-(a.stall||0),moved:(a,b)=>moved(b)-moved(a)||(a.due||'9').localeCompare(b.due||'9')};
  chips('psChips',[['risk','逾期與停滯優先'],['due','依期限'],['stall','沒有進度最久'],['moved','這次有異動的優先']],PV.sort,'data-psort');
  const w8=(DB.shw[p]||[]).slice(0,8);
  $('planListTitle').textContent=`${p} 列管中案件（${op.length}）`;
  $('planList').innerHTML=op.length?`<table class="ft"><thead><tr><th>案件</th><th>分類</th><th>階段與狀態</th><th>期限</th><th>沒有進度</th><th>近 8 次週會</th><th>這次匯入</th></tr></thead><tbody>${[...op].sort(sorters[PV.sort]).map(c=>{const late=lateAt(c,TODAY),g=STGN[stageNow(c)],hm=hmap(c);
    return`<tr><td><a class="lnk" data-id="${c.id}">${esc(c.desc)}</a><br><small style="color:var(--muted2);font-family:var(--mono)">${c.id}</small></td><td>${esc(catOf(c))}</td><td><span class="tag" style="border-left:4px solid var(${g[2]})">${g[1]}</span><br><small style="color:var(--muted)">${esc(c.status||'未填')}</small></td><td class="n">${c.due?md(c.due):esc(c.duetxt||'未定')}${c.ext?`<br><small style="color:var(--muted);font-family:var(--body)">原訂 ${md(c.due0)}，延後 ${c.ext} 次</small>`:''}${late?`<br><span class="tag red">逾期 ${late} 日</span>`:soonAt(c,TODAY)?'<br><span class="tag pur">7 日內</span>':HOLD.test(c.status||'')?'<br><span class="tag">暫緩</span>':''}</td><td class="n">${(c.stall||0)>=2?`<span class="tag ${c.stall>=4?'red':'amb'}">${c.stall} 週</span>`:'—'}</td><td><span class="hist">${w8.map(i=>`<i class="${histCls(hm.get(i))}" data-tip="${esc(WEEKS[i]+'：'+(hm.get(i)||'未登錄'))}"></i>`).join('')}</span></td><td>${isNew.has(c.id)?'<span class="tag blu">新增</span>':''}${chg.has(c.id)?`<span class="tag">狀態</span> <small style="color:var(--muted)">${esc(chg.get(c.id)||'未填')} → ${esc(c.status||'未填')}</small>`:''}${ext.has(c.id)?`${chg.has(c.id)?'<br>':''}<span class="tag ${ext.get(c.id)[0]<TODAY?'red':'amb'}">${ext.get(c.id)[0]<TODAY?'延後解除逾期':'延後'}</span> <small style="color:var(--muted)">${md(ext.get(c.id)[0])} → ${md(ext.get(c.id)[1])}</small>`:''}${moved(c)?'':'—'}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">目前沒有列管中的案件。</div>';
  const li2=(tg,cl,x,sub)=>`<li><span class="tag ${cl}">${tg}</span><span>${byId.has(x.id)?`<a data-id="${x.id}">${esc(x.desc)}</a>`:esc(x.desc)}<br><small>${esc(sub)}</small></span></li>`;
  $('planDiff').innerHTML=DF?(DF.closed.filter(x=>x.src===p).map(x=>li2('結案','grn',x,(x.before||'未填')+' → '+(x.status||'結案'))).concat(DF.new.filter(x=>x.src===p).map(x=>li2('新增','blu',x,x.status||'未填')),DF.extended.filter(x=>x.src===p).map(x=>li2('延後','amb',x,md(x.before)+' → '+md(x.after))),DF.missing.filter(x=>x.src===p).map(x=>li2('不見了','red',x,'Excel 裡已經沒有這一列'))).join('')||'<li>這次匯入沒有新增、結案或延後。</li>'):'<li>第二次匯入之後，這裡會列出和上一次的差異。</li>';
  $('planDiff').style.cssText='max-height:360px;overflow-y:auto';
  const wi0=(DB.shw[p]||[]).find(i=>(DB.sums[p]||{})[i]&&DB.sums[p][i].some(Boolean)),rec=wi0!==undefined?DB.sums[p][wi0]:null;
  $('planRepSub').textContent=rec?`${WEEKS[wi0].replace(/-/g,'/')} 週會，${p} 自己填的摘要`:'最近沒有填寫摘要';
  $('planRep').textContent=rec?`本週完成項目\n${rec[0]||'（未填）'}\n\n本週進度項目\n${rec[1]||'（未填）'}\n\n下週預計完成項目\n${rec[2]||'（未填）'}`:'這位企劃的週表最上面三列（本週完成、本週進度、下週預計完成）目前是空的。'}
/* ---------- wiring ---------- */
function renderAll(){renderOverview();renderPipeline();renderCases();renderWeekly()}
function route(){const VS=['overview','cases','weekly','plan','manage'],h=location.hash.slice(1),v=VS.includes(h)&&((h!=='manage'&&h!=='plan')||BOOT.role==='admin')?h:'overview';
  VS.forEach(k=>$('v-'+k).hidden=k!==v);
  document.querySelectorAll('.rail a').forEach(a=>a.dataset.v===v?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  if(v==='overview')renderCharts();if(v==='plan')renderPlan()}
function goCases(p){Object.assign(F,{st:'',flag:'',limit:60,grp:'all',src:'all',yr:''},p);renderCases();location.hash='cases';route();scrollTo(0,0)}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-id],[data-close],[data-src],[data-state],[data-st],[data-mode],[data-grp],[data-pl],[data-pk],[data-pv],[data-psort],#clr');if(!t)return;
  if(t.dataset.pv){PV.pl=t.dataset.pv;renderPlan();return}
  if(t.dataset.psort){PV.sort=t.dataset.psort;renderPlan();return}
  if(t.dataset.pk!==undefined){PF.k=t.dataset.pk;renderPipeline();return}
  if(t.id==='clr'){goCases({state:F.state});return}
  if(t.dataset.close!==undefined){t.closest('dialog').close();return}
  if(t.dataset.id){e.preventDefault();openCase(t.dataset.id);return}
  if(t.dataset.mode){W.mode=t.dataset.mode;renderWeekly();return}
  if(t.dataset.pl){W.pl=t.dataset.pl;W.wk=null;renderWeekly();return}
  if(t.dataset.grp){F.grp=t.dataset.grp;F.src='all';F.st='';F.flag='';F.limit=60;renderCases();return}
  if(t.dataset.st){goCases({st:t.dataset.st,state:'open'});return}
  if(t.dataset.src&&t.classList.contains('bar')){goCases({src:t.dataset.src,state:'open'});return}
  if(t.dataset.src){F.src=t.dataset.src;F.st='';F.flag='';F.limit=60;renderCases();return}
  if(t.dataset.state){if(t.classList.contains('stat'))goCases({state:t.dataset.state,flag:t.dataset.flag||'',yr:t.dataset.yr||'',sort:t.dataset.flag?'due':'score'});else{F.state=t.dataset.state;F.st='';F.flag='';F.limit=60;renderCases()}return}
});
$('q').oninput=e=>{F.q=e.target.value;F.limit=60;renderCases()};
$('yrSel').innerHTML='<option value="">全部年度</option>'+[String(+YR+1),...[...YRS].reverse()].map(y=>`<option>${y}</option>`).join('');
$('yrSel').onchange=e=>{F.yr=e.target.value;renderCases()};
$('catSel').innerHTML='<option value="">全部分類</option>'+CATS.map(k=>`<option>${k}</option>`).join('');
$('catSel').onchange=e=>{F.k=e.target.value;F.limit=60;renderCases()};
$('sortSel').onchange=e=>{F.sort=e.target.value;renderCases()};
$('wkSel').onchange=e=>{W.wk=+e.target.value;renderWeekly()};
$('moreBtn').onclick=()=>{F.limit+=120;renderCases()};
$('newBtn').onclick=$('newBtn2').onclick=()=>$('newDlg').showModal();
$('copyBtn').onclick=()=>{const ok=()=>{$('copied').hidden=false;setTimeout(()=>$('copied').hidden=true,1800)};
  (navigator.clipboard?navigator.clipboard.writeText($('report').textContent):Promise.reject()).then(ok).catch(()=>{const r=document.createRange();r.selectNodeContents($('report'));const s=getSelection();s.removeAllRanges();s.addRange(r)})};
let newN=0;
$('newForm').onsubmit=e=>{e.preventDefault();const id='N'+String(++newN).padStart(4,'0'),src=$('n-src').value,cm=$('n-cm').value.trim();
  const c={id,g:PL.includes(src)?'p':'m',src,topic:$('n-topic').value.trim()||'General',desc:$('n-desc').value.trim(),status:$('n-status').value.trim()||'Pending',due:$('n-due').value||undefined,req:TODAY,done:0,y:YR,ul:['通報成立']};
  c.cm0=cm||'本案今日成立。本中心已建檔，並預祝它不會出現在逾期排行榜上。';
  cases.push(c);byId.set(id,c);e.target.reset();$('n-status').value='Pending';$('newDlg').close();renderAll();openCase(id)};
$('n-src').innerHTML=[...PLC,...MK].map(k=>`<option value="${k}">${SRC[k]}</option>`).join('');
addEventListener('hashchange',route);
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(!$('v-overview').hidden)renderCharts();if(!$('v-plan').hidden)renderPlan()},150)});
renderAll();route();

if(VIEW){document.body.classList.add('viewer');$('roleBtn').hidden=true}
$('basis').textContent='資料基準日 '+TODAY.replace(/-/g,'/')+(BOOT.lastRun?'｜最近一次匯入：'+new Date(BOOT.lastRun.at).toLocaleString('zh-TW',{dateStyle:'medium',timeStyle:'short'})+'（'+BOOT.lastRun.by+'）':'')+'｜'+(BOOT.role==='admin'?'你是管理者':'唯讀帳號');
