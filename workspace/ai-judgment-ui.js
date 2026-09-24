const colors={yellow:'黃｜待確認',red:'紅｜有反證'};
export function createAiJudgmentUI(ctx){
 const {state,api,show,esc,board,say,dialog}=ctx;
 const select=(name,options,value)=>`<select name="${name}"><option value="">請選擇</option>${Object.entries(options).map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join('')}</select>`;
 const area=(name,value,max=1600)=>`<textarea name="${name}" rows="3" maxlength="${max}">${esc(value||'')}</textarea>`;
 function reading(r){const a=r.answers;return `<div class="judgment-reading"><p><strong>圖卡編號／版本：</strong>${esc(a.sourceReference)}</p><h3>1. AI 留言判讀</h3><p>${esc(a.comment)}：「${esc(a.quote)}」</p><p><strong>${esc(colors[a.color]||(a.color==='green'?'綠｜有據（舊版紀錄）':'尚未判色'))}</strong></p><p>${esc(a.evidence)}</p><h3>2. 改後的一句</h3><p>${esc(a.rewritten)}</p><small>${r.status==='submitted'?'已送出':'草稿'} · 第 ${r.revision} 版 · ${esc(new Date(r.updated_at).toLocaleString('zh-TW'))}</small></div>`;}
 function assessment(rows=[]){return `<details class="ai-assessment"><summary>W5 AI 留言判讀 · ${rows.filter(r=>r.status==='submitted').length} 份已送出</summary>${rows.length?rows.map(reading).join(''):'<p>尚無線上判讀紀錄；請依實際本人證據評閱。</p>'}<p class="muted">AI 留言是判讀材料，不是真人初讀；送出不等於達標。</p></details>`;}
 function panel(){
  if(state.board.activity.kind!=='w5-personal')return '';
  const students=(state.roster||[]).filter(s=>s.active&&s.is_test===state.board.activity.testOnly),rows=(state.aiJudgments||[]).filter(r=>state.home.person.role==='student'||students.some(s=>s.student_id===r.student_id)),teacher=state.home.person.role!=='student';
  if(teacher)return `<section class="panel" aria-label="W5 AI 留言判讀"><h2>AI 留言判讀</h2><p>與文轉圖交件分開保存，僅本人及授課教師可查閱。</p><p>${rows.filter(r=>r.status==='submitted').length} 人已送出 · ${rows.filter(r=>r.status==='draft').length} 人有草稿；送出不等於達標。</p>${students.map(s=>{const r=rows.find(r=>r.student_id===s.student_id);return `<details><summary>${esc(s.seat+' 號 '+s.name)} · ${r?(r.status==='submitted'?'已送出':'草稿'):'尚未保存'}</summary>${r?reading(r):'<p>尚無線上判讀紀錄。</p>'}</details>`;}).join('')}</section>`;
  const r=rows[0],editable=state.board.activity.accepting&&!state.board.activity.archived;
  return `<section class="panel" aria-label="AI 留言判讀"><p class="eyebrow">先回看 W4 作品</p><h2>AI 留言判讀</h2><p>對照自己的圖卡與甲乙留言，找出一句黃或紅的留言，再改寫這一句。</p><p>${r?(r.status==='submitted'?'已送出判讀':'已保存草稿')+' · 第 '+r.revision+' 版':'尚未保存'}</p><button data-action="aiJudgment">${editable?(r?'查看／繼續填寫':'看圖卡並開始判讀'):'查看我的判讀'}</button><p class="muted small-text">只供本人及授課教師查閱；不用抄進歷程本，也不用另拍照上傳。</p></section>`;
 }
 async function action(el){
  if(el.dataset.action!=='aiJudgment')return false;
  const data=await api('aiJudgments',{activityId:state.activity}),r=data.responses[0],a=r?.answers||{};
  if(!state.board.activity.accepting||state.board.activity.archived){show('<h2>我的 AI 留言判讀</h2>'+(r?reading(r):'<p>尚無保存紀錄。</p>'));return true;}
  const cards=state.board.aiReadings||[],card=cards.find(c=>a.sourceReference?.startsWith(c.id+' / '))||cards.find(c=>c.has_pair)||cards[0];
  if(!card){show('<h2>我的 AI 留言判讀</h2><p>目前尚無你的圖卡與甲乙留言，請依老師指示確認。先不用填判讀。</p>'+(r?reading(r):''));return true;}
  const source=await api('aiReading',{readingId:card.id}),sourceReference=a.sourceReference||`${source.id} / W4 V${source.ordinal}`;
  const context=`<section aria-label="對照圖卡與甲乙留言"><h3>我的 W4 V${source.ordinal} 圖卡</h3>${source.taskNote?`<p class="notice">${esc(source.taskNote)}</p>`:''}<div class="ai-reading-image"><img src="${esc(source.imageUrl)}" alt="這次判讀對照的本人 W4 圖卡"></div>${source.commentA?`<div class="ai-reading-comments"><section><h3>甲</h3><p>${esc(source.commentA)}</p></section><section><h3>乙</h3><p>${esc(source.commentB)}</p></section></div>`:''}</section>`;
  if(!source.commentA||!source.commentB){show('<h2>先確認圖卡提醒</h2>'+context+'<p>這份圖卡目前只有提醒，尚無甲乙留言。請先依老師指示處理，不必自行編留言填答。</p>'+(r?reading(r):''));return true;}
  show(`<h2>我的 AI 留言判讀</h2><p>先讀完甲乙留言，逐句對照畫面，再摘出一句「黃｜待確認」或「紅｜有反證」的留言，不選整段。</p><p class="muted">不使用 AI 代答；兩項直接在這裡回覆。</p>${context}<form id="aiJudgment" data-revision="${r?.revision||0}"><input type="hidden" name="sourceReference" value="${esc(sourceReference)}"><fieldset><legend>1. AI 留言判讀｜找一句黃或紅</legend><label>摘自哪則留言？${select('comment',{'甲':'甲','乙':'乙'},a.comment)}</label><label>摘一句${area('quote',a.quote,1200)}</label><label>這一句的判斷${select('color',colors,a.color)}</label><label>畫面依據${area('evidence',a.evidence)}<small>第＿＿格的＿＿反駁／還不能確定＿＿。沒有支持，不等於有反證。</small></label></fieldset><fieldset><legend>2. 改後的一句｜保留有據的意思</legend><label>改後的一句${area('rewritten',a.rewritten)}<small>不要只加「可能」；刪無據細節或縮小範圍。</small></label></fieldset><p class="muted">AI 留言不代表真人已看懂。</p><p id="formStatus" role="status"></p><div class="row"><button name="status" value="draft" class="secondary">保存草稿</button><button name="status" value="submitted">送出判讀</button></div></form>`);return true;
 }
 async function submit(form,values,submitter){if(form.id!=='aiJudgment')return false;const answers=Object.fromEntries(['sourceReference','comment','quote','color','evidence','rewritten'].map(k=>[k,String(values.get(k)||'')]));const status=submitter?.value==='submitted'?'submitted':'draft';await api('saveAiJudgment',{activityId:state.activity,expectedRevision:Number(form.dataset.revision),status,answers},true);state.dirty=false;dialog.close();await board();say(status==='submitted'?'判讀已送出；可以接著做文轉圖。':'草稿已保存，可以稍後繼續。');return true;}
 return {panel,action,submit,assessment};
}
