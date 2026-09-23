export function createAccountsUI({state,api,app,heading,show,dialog,button,esc,say}){
 let data=null,query='',className='',kind='formal',receipt=null;
 const $=s=>document.querySelector(s);
 dialog.addEventListener('close',()=>{receipt=null;if($('#issuedAccountCode'))$('#detailBody').replaceChildren();});
 async function open(){
  data=await api('studentAccounts',{term:state.termView||state.home.currentTerm});state.activity=null;state.board=null;
  heading('學生帳號與登入碼','查找學生、處理忘記六碼與帳號停用；作品及學習紀錄保留。');
  app.innerHTML=`${button('← 教學工作台','home','',true)}<section class="panel"><div class="section-title"><h2>${esc(data.term)} 學期學生名單</h2><div class="row">${!data.readOnly?button('追加本學期學生','rosterAdd','',true):''}${button('重新載入名單','studentAccounts','',true)}</div></div><p>原六碼沿用，系統只保存驗證資料，不能查回原碼。忘記時可重設為隨機六碼或自行指定。</p>${data.readOnly?'<p class="notice">這是歷史學期，只供查閱。請回教學工作台選目前學期再管理帳號。</p>':''}<div class="account-filters"><label>搜尋學生<input id="accountSearch" type="search" placeholder="姓名、座號或學號" value="${esc(query)}"></label><label>班級<select id="accountClass"><option value="">全部班級</option>${[...new Set(data.students.map(s=>s.className))].map(c=>`<option value="${esc(c)}" ${c===className?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>帳號範圍<select id="accountKind"><option value="formal" ${kind==='formal'?'selected':''}>正式學生</option><option value="test" ${kind==='test'?'selected':''}>測試帳號</option><option value="all" ${kind==='all'?'selected':''}>全部帳號</option></select></label></div><p id="accountCount" class="muted" role="status"></p><div id="accountRows"></div><p class="muted">換學期的完整名單匯入，請使用教學工作台的「學期管理」。停用不會刪除作品、回饋或成績。</p></section>`;
  render();
 }
 function render(){
  const students=data.students.filter(s=>(!className||s.className===className)&&(kind==='all'||s.isTest===(kind==='test'))&&(!query||[s.name,s.studentId,String(s.seat)].some(v=>v.includes(query))));
  $('#accountCount').textContent=`顯示 ${students.length} 人 · ${students.filter(s=>s.active).length} 人可登入`;
  $('#accountRows').innerHTML=students.map(s=>`<article class="account-row"><div><h3>${esc(s.className)} 班 ${s.seat} 號 · ${esc(s.name)}</h3><p class="muted">學號 ${esc(s.studentId)}${s.isTest?' · 測試帳號':''}</p><div class="row"><span class="tag">${s.active?'可登入':'已停用'}</span><span class="muted small-text">${s.agreementAccepted?'已完成登入同意':'尚未完成登入同意'}</span></div></div><div class="row account-actions">${s.canManage?`${button('修正姓名／座號','profileEdit',`data-id="${esc(s.studentId)}"`,true)}${s.active?button('重設六碼','accountReset',`data-id="${esc(s.studentId)}"`,true):''}${button(s.active?'停用帳號':'恢復帳號','accountActive',`data-id="${esc(s.studentId)}"`,true)}`:'<span class="muted">僅供查閱</span>'}</div></article>`).join('')||'<p class="empty-state">沒有符合條件的學生，請調整搜尋或篩選。</p>';
 }
 async function action(el){
  const a=el.dataset.action;if(a==='studentAccounts'){await open();return true;}
  if(a==='accountCodeDownload'&&receipt){const safe=x=>String(x).replace(/[\t\r\n]/g,' ').replace(/^[=+@-]/,"'$&"),content='學期\t學號\t姓名\t班級\t座號\t新六碼\n'+[receipt.term,receipt.studentId,receipt.name,receipt.className,receipt.seat,receipt.code].map(safe).join('\t');const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`${receipt.term}-${receipt.studentId}-新登入碼.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;}
  if(!['accountReset','accountActive'].includes(a))return false;
  const s=data.students.find(s=>s.studentId===el.dataset.id);if(!s?.canManage)throw Error('請重新載入名單並核對權限。');
  const reset=a==='accountReset';
  show(`<h2>${reset?'重設學生六碼':s.active?'停用學生帳號':'恢復學生帳號'}</h2><p><strong>${esc(s.className)} 班 ${s.seat} 號 · ${esc(s.name)}</strong><br>學號 ${esc(s.studentId)} · ${esc(data.term)} 學期</p><form id="studentAccountUpdate" data-student="${esc(s.studentId)}" data-revision="${s.revision}" data-operation="${reset?'resetCode':'setActive'}" data-active="${!s.active}">${reset?'<label>新六碼設定方式<select id="accountCodeMode" name="mode"><option value="random">自動產生隨機六碼</option><option value="manual">由老師指定六碼</option></select></label><label id="manualCodeLabel" hidden>指定六位數字<input name="code" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password" disabled></label><p>重設後舊碼立即失效，學生須用新碼重新登入。新碼只在本次完成畫面顯示，可下載後私下交給本人。</p>':`<p>${s.active?'停用後不能登入，現有登入也會失效。作品與回饋保留，可隨時恢復。':'恢復後可使用原六碼重新登入；若忘記六碼，恢復後再按「重設六碼」。'}</p>`}<label class="check-row"><input name="confirmed" type="checkbox" required>已核對學生，確認${reset?'重設這位學生的登入碼':s.active?'停用這位學生的帳號':'恢復這位學生的帳號'}</label><p id="formStatus" role="status"></p><button>${reset?'確認重設六碼':s.active?'確認停用':'確認恢復'}</button></form>`);return true;
 }
 async function submit(form,values){
  if(form.id!=='studentAccountUpdate')return false;
  if(!values.has('confirmed'))throw Error('請先核對學生並勾選確認。');
  const s=data.students.find(s=>s.studentId===form.dataset.student),r=await api('studentAccountUpdate',{term:data.term,studentId:s.studentId,expectedRevision:Number(form.dataset.revision),operation:form.dataset.operation,...(form.dataset.operation==='resetCode'?{mode:values.get('mode'),...(values.get('mode')==='manual'?{code:values.get('code')}:{})}:{active:form.dataset.active==='true'})},true);
  state.dirty=false;
  // Display the only plaintext copy before any optional refresh can fail.
  if(r.code){receipt={...s,...r};show(`<h2>新六碼已設定</h2><p>${esc(s.className)} 班 ${s.seat} 號 · ${esc(s.name)}<br>學號 ${esc(s.studentId)}</p><p id="issuedAccountCode" class="issued-account-code">${esc(r.code)}</p><p>請私下交給本人；不要投影或貼在班級群組。關閉後無法查回，遺失時需重新設定。</p>${button('下載這位學生的新登入碼','accountCodeDownload','',true)}`);}
  else dialog.close();
  s.revision=r.revision;if(form.dataset.operation==='setActive')s.active=form.dataset.active==='true';render();say(r.code?'已重設六碼，舊登入已失效。':'帳號狀態已更新，作品與回饋保留。');return true;
 }
 document.addEventListener('input',e=>{if(e.target.id==='accountSearch'){query=e.target.value.trim();render();}});
 document.addEventListener('change',e=>{if(e.target.id==='accountClass'){className=e.target.value;render();}if(e.target.id==='accountKind'){kind=e.target.value;render();}if(e.target.id==='accountCodeMode'){const manual=e.target.value==='manual',input=e.target.form.elements.code;$('#manualCodeLabel').hidden=!manual;input.disabled=!manual;input.required=manual;if(!manual)input.value='';}});
 return {action,submit};
}
