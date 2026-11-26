/* 管理頁：匯入 Excel、看差異、帳號、API 評語。不依賴 app.js，第一次還沒有資料時也能用。 */
(()=>{
const B=window.__BOOT,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const api=async(url,opt={})=>{const r=await fetch(url,opt);let d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.detail||'伺服器沒有回應，請稍後再試');return d};
const post=(url,body)=>api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
$('logoutBtn').onclick=async()=>{await post('/api/logout');location.href='/login'};
const root=$('v-manage');
if(!B.db){
  document.querySelectorAll('.view').forEach(v=>v.hidden=v!==root);
  document.querySelector('.rail').hidden=true;document.querySelector('.shell').classList.add('solo');$('roleBtn').hidden=true;$('fBtn').hidden=true;
  $('basis').textContent=B.role==='admin'?'還沒有資料。請先匯入兩份 Excel。':'還沒有資料，請等管理者匯入。';
}
if(B.role!=='admin')return;
root.innerHTML=`
<div class="card"><h2>匯入 Excel</h2><p class="sub">照常填 Excel，每週把檔案傳上來。會先給你看和上一次的差異，按「套用」才會更新。只傳其中一份也可以，另一份沿用上次的。</p>
  <form class="mform" id="impForm"><div class="mrow">
    <label>企劃週追蹤表<input type="file" id="f-team" accept=".xlsx,.xlsm"></label>
    <label>製作需求總表<input type="file" id="f-make" accept=".xlsx,.xlsm"></label>
    <label>資料基準日（可留白）<input type="date" id="f-asof"></label>
    <button class="btn grad" type="submit" id="impBtn">預覽差異</button></div>
    <p class="sub" style="margin:0">基準日留白時，用週表最新一欄的日期。逾期天數、沒有進度幾週都從這一天算。</p></form>
  <div id="impOut"></div></div>
<div class="cols2">
  <div class="card"><h2>匯入紀錄</h2><p class="sub">每次匯入的異動摘要</p><ul class="dlist" id="runs"></ul><div class="mrow"><button class="btn sm" id="rebuildBtn">用最新規則重算最近一次匯入</button></div><p class="sub" style="margin:0">判讀規則更新後按這個，不用重新上傳檔案，也不會多一筆匯入紀錄。</p><div id="rebuildOut"></div></div>
  <div class="card"><h2>帳號</h2><p class="sub">其他帳號只能看，不能改</p><ul class="dlist" id="users"></ul>
    <form class="mform" id="userForm"><div class="mrow"><label>帳號<input id="u-name" required autocomplete="off"></label><label>密碼（至少 8 個字）<input id="u-pw" type="password" required minlength="8" autocomplete="new-password"></label><button class="btn" type="submit">新增唯讀帳號</button></div></form></div>
</div>
<div class="cols2">
  <div class="card"><h2>API 評語</h2><p class="sub">還沒有評語的案件，交給 Claude API 逐案寫。列管中的先寫。</p><div id="cmBox"></div></div>
  <div class="card"><h2>匯入設定檔</h2><p class="sub">一次性把原型裡的評語和判定搬過來（JSON 檔）。會和現有的合併，不會清掉已有的。</p>
    <form class="mform" id="seedForm"><div class="mrow"><label>設定檔<input type="file" id="f-seed" accept=".json" required></label><button class="btn" type="submit">匯入</button></div></form><div id="seedOut"></div></div>
</div>`;
const say=(el,msg,bad)=>{$(el).innerHTML=`<p class="sub" style="margin:8px 0 0;color:var(${bad?'--coral':'--green'})">${esc(msg)}</p>`};
/* ---- 匯入 ---- */
const LABEL={new:['新案件','blu'],closed:['結案','grn'],status:['狀態變動',''],extended:['期限延後','amb'],reopened:['重新列管','red'],missing:['Excel 裡不見了','red']};
const line=(k,c)=>`<li>${c.id?`<small>${esc(c.id)}</small> `:''}${esc(c.desc)} <small>${esc(c.src)}${k==='status'||k==='closed'||k==='reopened'?`｜${esc(c.before||'未填')} → ${esc(c.status||'未填')}`:k==='extended'?`｜${esc(c.before)} → ${esc(c.after)}`:c.status?'｜'+esc(c.status):''}</small></li>`;
function showDiff(d,counts){return`<div class="dstats">${Object.keys(LABEL).map(k=>`<span class="tag ${LABEL[k][1]}">${LABEL[k][0]} ${counts[k]||0}</span>`).join('')}<span class="tag">合計 ${counts.total||0} 案</span></div>`+Object.keys(LABEL).filter(k=>(d[k]||[]).length).map(k=>`<details class="dsec"><summary>${LABEL[k][0]}（${counts[k]}${counts[k]>d[k].length?'，顯示前 '+d[k].length+' 筆':''}）</summary><ul class="dlist">${d[k].map(c=>line(k,c)).join('')}</ul></details>`).join('')}
$('impForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData();
  if($('f-team').files[0])fd.append('team',$('f-team').files[0]);if($('f-make').files[0])fd.append('creatives',$('f-make').files[0]);
  if(!fd.has('team')&&!fd.has('creatives')){say('impOut','請至少選一個檔案',1);return}
  fd.append('as_of',$('f-asof').value);$('impBtn').disabled=true;$('impBtn').textContent='讀取中…';
  try{const p=await api('/api/import/preview',{method:'POST',body:fd}),c=p.diff.counts;
    $('impOut').innerHTML=`<div class="mform" style="margin-top:12px"><p class="sub" style="margin:0">基準日 ${esc(p.as_of)}｜現任企劃：${esc(p.planners.current.join('、'))}${p.planners.former.length?'｜歷史（隱藏的工作表）：'+esc(p.planners.former.join('、')):''}</p>
      ${p.first?`<div class="dstats"><span class="tag blu">第一次匯入，共 ${c.total} 案</span></div>`:showDiff(p.diff,c)}
      ${p.suggestions.length?`<details class="dsec" open><summary>可能只是改了描述的案件（${p.suggestions.length}）</summary><p class="sub" style="margin:6px 0">勾選的會沿用原本的案號、評語和連結；不勾就當成新案。</p><ul class="dlist">${p.suggestions.map(s=>`<li><label><input type="checkbox" data-new="${s.new.key}" data-old="${s.old.key}" ${s.score>=.75?'checked':''}> ${esc(s.new.desc)}<br><small>原本是 ${esc(s.old.id)} ${esc(s.old.desc)}｜相似 ${Math.round(s.score*100)}%</small></label></li>`).join('')}</ul></details>`:''}
      ${!p.first&&p.diff.missing.length&&p.diff.new.length?`<details class="dsec" open><summary>手動指認：不見的案件其實是哪一筆新案（${p.diff.missing.length}）</summary><p class="sub" style="margin:6px 0">描述改很多、或是從一位企劃移交給另一位時，系統認不出來。在這裡指認後，會沿用原本的案號、評語和連結。不選就當成真的不見了。</p><ul class="dlist">${p.diff.missing.map(m=>`<li><label>${esc(m.id)} ${esc(m.desc)} <small>${esc(m.src)}</small><br><select data-old="${m.key}" aria-label="${esc(m.desc)} 對應的新案"><option value="">真的不見了</option>${p.diff.new.filter(n=>n.g===m.g).sort((x,y)=>(y.src===m.src)-(x.src===m.src)).map(n=>`<option value="${n.key}">${esc(n.src)}｜${esc(n.desc)}</option>`).join('')}</select></label></li>`).join('')}</ul></details>`:''}
      <div class="mrow"><button class="btn grad" id="applyBtn">套用這次匯入</button></div></div>`;
    $('applyBtn').onclick=async()=>{const aliases={};$('impOut').querySelectorAll('input[data-new]:checked').forEach(i=>aliases[i.dataset.new]=i.dataset.old);$('impOut').querySelectorAll('select[data-old]').forEach(s=>{if(s.value)aliases[s.value]=s.dataset.old});
      $('applyBtn').disabled=true;$('applyBtn').textContent='套用中…';try{await post('/api/import/apply/'+p.run,{aliases});location.hash='overview';location.reload()}catch(err){say('impOut',err.message,1)}};
  }catch(err){say('impOut',err.message,1)}
  $('impBtn').disabled=false;$('impBtn').textContent='預覽差異'};
/* ---- 匯入紀錄 ---- */
api('/api/import/runs').then(rs=>{$('runs').innerHTML=rs.length?rs.map(r=>{const c=r.diff.counts||{};return`<li><b>${esc(r.as_of)}</b> <small>${new Date(r.at).toLocaleString('zh-TW',{dateStyle:'medium',timeStyle:'short'})}｜${esc(r.by)}</small><br><small>合計 ${c.total||0}｜新案 ${c.new||0}｜結案 ${c.closed||0}｜狀態變動 ${c.status||0}｜延後 ${c.extended||0}｜不見 ${c.missing||0}</small></li>`}).join(''):'<li>還沒有匯入過。</li>'}).catch(()=>{});
$('rebuildBtn').onclick=async()=>{$('rebuildBtn').disabled=true;try{const r=await post('/api/import/rebuild');say('rebuildOut',`重算完成，有 ${r.changed} 案的結案判定改變。重新整理後生效。`)}catch(err){say('rebuildOut',err.message,1)}$('rebuildBtn').disabled=false};
/* ---- 帳號 ---- */
const loadUsers=()=>api('/api/users').then(us=>{$('users').innerHTML=us.map(u=>`<li>${esc(u.name)} <small>${u.role==='admin'?'管理者':'唯讀'}</small>${u.role==='admin'?'':` <a class="lnk" data-del="${esc(u.name)}">刪除</a>`}</li>`).join('');
  $('users').querySelectorAll('[data-del]').forEach(a=>a.onclick=async()=>{await api('/api/users/'+encodeURIComponent(a.dataset.del),{method:'DELETE'});loadUsers()})});
loadUsers();
$('userForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/users',{username:$('u-name').value,password:$('u-pw').value});e.target.reset();loadUsers()}catch(err){alertLine(err.message)}};
const alertLine=m=>{$('users').insertAdjacentHTML('beforeend',`<li style="color:var(--coral)">${esc(m)}</li>`)};
/* ---- API 評語 ---- */
async function loadCm(){const s=await api('/api/comments/status'),p=s.progress,e=s.estimate;
  $('cmBox').innerHTML=`<div class="mform"><div class="dstats"><span class="tag blu">尚無評語 ${s.missing} 案</span><span class="tag">模型 ${esc(e.model)}</span><span class="tag">約 ${e.requests} 次請求</span></div>
    <p class="sub" style="margin:0">估計用量：輸入約 ${e.input_chars.toLocaleString()} 字元、輸出約 ${e.output_chars.toLocaleString()} 字元。費用請以 Anthropic 官方價格換算。</p>
    ${s.has_key?'':'<p class="sub" style="margin:0;color:var(--coral)">伺服器還沒有設定 ANTHROPIC_API_KEY，設定後才能產生。</p>'}
    ${p.running?`<p class="sub" style="margin:0">產生中：已處理 ${p.seen} / ${p.total}，寫好 ${p.done} 則${p.error?'；最近一次錯誤：'+esc(p.error):''}</p>`:`<div class="mrow"><label>這次最多寫幾案<input type="number" id="cm-limit" value="${Math.min(200,s.missing)||0}" min="1" max="10000"></label><button class="btn grad" id="cmGo" ${s.has_key&&s.missing?'':'disabled'}>開始產生</button></div>${p.total&&!p.running?`<p class="sub" style="margin:0">上一次：寫好 ${p.done} / ${p.total} 則${p.error?'；錯誤：'+esc(p.error):''}。重新整理頁面後會看到新評語。</p>`:''}`}</div>`;
  if($('cmGo'))$('cmGo').onclick=async()=>{try{await post('/api/comments/generate',{limit:+$('cm-limit').value});loadCm()}catch(err){$('cmBox').insertAdjacentHTML('beforeend',`<p class="sub" style="color:var(--coral)">${esc(err.message)}</p>`)}};
  if(p.running)setTimeout(loadCm,3000)}
loadCm().catch(()=>{});
/* ---- 設定檔 ---- */
$('seedForm').onsubmit=async e=>{e.preventDefault();try{const data=JSON.parse(await $('f-seed').files[0].text());const r=await post('/api/seed',data);say('seedOut',`已匯入，目前共有 ${r.comments} 則評語。重新整理後生效。`)}catch(err){say('seedOut','這個檔案讀不了：'+err.message,1)}};
})();
