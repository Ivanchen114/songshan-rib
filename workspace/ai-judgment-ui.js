const colors={yellow:'黃｜待確認',red:'紅｜有反證'};
export function judgmentStatus(cards=[],response){
 if(response)return response.status==='submitted'?'已送出':'草稿';
 if(cards.some(c=>c.status==='published'&&c.has_pair))return '尚未保存';
 if(cards.some(c=>c.status==='published'))return '先處理圖卡提醒';
 return '尚無已發布的甲乙留言';
}
export function createAiJudgmentUI(ctx){
 const {state,api,show,esc,board,say,dialog}=ctx;
 const select=(name,options,value)=>`<select name="${name}"><option value="">請選擇</option>${Object.entries(options).map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join('')}</select>`;
 const area=(name,value,max=1600)=>`<textarea name="${name}" rows="3" maxlength="${max}">${esc(value||'')}</textarea>`;
 function reading(r){const a=r.answers;return `<div class="judgment-reading authored source-student"><strong class="source-label">${state.home.person.role==='student'?'我的作答':'學生作答'} · 原文</strong><p><strong>圖卡編號／版本：</strong>${esc(a.sourceReference)}</p><h3>1. AI 留言判讀</h3><blockquote class="source-ai"><small>引用 AI 留言 ${esc(a.comment)}</small><p>「${esc(a.quote)}」</p></blockquote><p><strong>${esc(colors[a.color]||(a.color==='green'?'綠｜有畫面依據（舊版紀錄）':'尚未選擇顏色'))}</strong></p><p>${esc(a.evidence)}</p><h3>2. 改後的一句</h3><p>${esc(a.rewritten)}</p><small>${r.status==='submitted'?'已送出':'草稿'} · 第 ${r.revision} 版 · ${esc(new Date(r.updated_at).toLocaleString('zh-TW'))}</small></div>`;}
 function assessment(rows=[]){return `<details class="ai-assessment"><summary>W5 AI 留言判讀 · ${rows.filter(r=>r.status==='submitted').length} 份已送出</summary>${rows.length?rows.map(reading).join(''):'<p>尚無線上判讀紀錄；請依學生實際留下的作答與作品評閱。</p>'}<p class="muted">AI 留言是判讀材料，不是同學的實際回饋；送出不等於達標。</p></details>`;}
 function panel(){
  if(state.board.activity.kind!=='w5-personal')return '';
  const students=(state.roster||[]).filter(s=>s.active&&s.is_test===state.board.activity.testOnly),rows=(state.aiJudgments||[]).filter(r=>state.home.person.role==='student'||students.some(s=>s.student_id===r.student_id)),teacher=state.home.person.role!=='student';
  if(teacher)return `<section class="panel" aria-label="W5 AI 留言判讀"><h2>AI 留言判讀</h2><button class="secondary" data-action="demoPlan">提供範例給沒有可用甲乙者</button><p>與文字轉圖作品分開保存，僅本人及授課教師可查閱。</p><p>${rows.filter(r=>r.status==='submitted').length} 人已送出 · ${rows.filter(r=>r.status==='draft').length} 人有草稿；送出不等於達標。</p>${students.map(s=>{const r=rows.find(r=>r.student_id===s.student_id),cards=(state.board.aiReadings||[]).filter(c=>c.seat===s.seat),status=judgmentStatus(cards,r);return `<details data-judgment-student="${esc(s.student_id)}"><summary>${esc(s.seat+' 號 '+s.name)} · ${status}</summary>${r?reading(r):'<p>'+status+'。'+(status==='尚未保存'?'請學生完成自己的判讀。':'先依實際圖卡安排補件；不要求學生自行編甲乙留言，可接著把文字畫成圖。')+'</p>'}</details>`;}).join('')}</section>`;
  const r=rows[0],submittedCard=r?.status==='submitted'?(state.board.aiReadings||[]).find(c=>!c.isDemo&&r.answers.sourceReference===`${c.id} / W4 V${c.ordinal}`):null,editable=state.board.activity.accepting&&!state.board.activity.archived;
  return `<section class="panel" aria-label="AI 留言判讀"><p class="eyebrow">先回看 W4 作品</p><h2>AI 留言判讀</h2><p>對照你的圖卡或老師分派的示範與甲乙留言，找出一句黃或紅的留言，再改寫這一句。</p><p>${r?(r.status==='submitted'?'已送出判讀':'已保存草稿')+' · 第 '+r.revision+' 版':'尚未保存'}</p><button data-action="aiJudgment">${editable?(r?'查看／繼續填寫':'看圖卡並開始判讀'):'查看我的判讀'}</button>${submittedCard?`<button class="secondary" data-action="aiReading" data-id="${esc(submittedCard.id)}">查看判讀紀錄與依據</button>`:''}<p class="muted small-text">只供本人及授課教師查閱；不用抄進歷程本，也不用另拍照上傳。</p></section>`;
 }
 async function action(el){
  if(el.dataset.action==='demoPlan'){
   const plan=await api('demoPlan',{activityId:state.activity,className:state.className});
   state.demoPlan=plan;
   show(`<h2>發放示範練習</h2><p>${esc(plan.term)} 學期 · ${esc(plan.className)} 班</p><p>列出沒有可用甲乙、尚未領取範例且沒有既有作答的學生。有上傳但僅有提醒者也會列入。每人取得 A、B、C 三份範例，自選一份；原作品與補件提醒保留。</p><ul>${plan.candidates.map(s=>`<li>${s.seat} 號 ${esc(s.name)} → 三選一：${esc(s.reason)}</li>`).join('')}</ul><p>待發 ${plan.candidates.length} 人；已有範例 ${plan.alreadyAssigned} 人。下次可重複執行，會重新查名單並跳過已發者。</p>${plan.coverage?`<p>全班 ${plan.coverage.total} 人；已有可用材料 ${plan.coverage.covered} 人，尚缺 ${plan.coverage.missing} 人。</p>`:''}${plan.needsReview?.length?`<section class="notice"><h3>需教師核對（不自動換題）</h3><ul>${plan.needsReview.map(s=>`<li>${s.seat} 號 ${esc(s.name)}：${esc(s.reason)}</li>`).join('')}</ul></section>`:''}${plan.candidates.length?'<button data-action="assignDemos">確認發給以上同學</button>':'<p>目前沒有需要新增發放的學生。</p>'}`);return true;
  }
  if(el.dataset.action==='assignDemos'){
   const plan=state.demoPlan;if(!plan)return true;
   const result=await api('assignDemos',{activityId:plan.activityId,className:plan.className,token:plan.token},true);
   state.demoPlan=null;dialog.close();await board();say(`已提供 ${result.assigned} 人三選一範例；學生 W4 交件狀態未改。`);return true;
  }
  if(el.dataset.action!=='aiJudgment')return false;
  const data=await api('aiJudgments',{activityId:state.activity}),r=data.responses[0];let a=r?.answers||{};
  if(!state.board.activity.accepting||state.board.activity.archived){show('<h2>我的 AI 留言判讀</h2>'+(r?reading(r):'<p>尚無保存紀錄。</p>'));return true;}
  const cards=state.board.aiReadings||[],choices=cards.filter(c=>c.isDemo&&c.has_pair);
  if(choices.length>1&&!el.dataset.id&&(!a.sourceReference||el.dataset.choose==='true')){
   if(el.dataset.choose==='true'&&!window.confirm('改選後會開啟空白判讀表。尚未保存的輸入會清除；已保存的紀錄會保留到你再次保存或送出。確定改選？'))return true;
   const first=await api('aiReading',{readingId:choices[0].id});
   show(`<h2>三選一：選一份示範練習</h2><p>先看圖卡與甲乙留言，再選一份完成判讀，不用三份都做。</p><p class="notice">${esc(first.taskNote||'')}</p>${choices.map(c=>`<section class="panel"><h3>${esc(c.label)}</h3><div class="row"><button class="secondary" data-action="aiReading" data-id="${esc(c.id)}">查看圖卡與甲乙</button><button data-action="aiJudgment" data-id="${esc(c.id)}">選這份，開始判讀</button></div></section>`).join('')}<p>查看範例後，可關閉視窗，再按「看圖卡並開始判讀」回來選擇。</p>`);return true;
  }
  const selected=el.dataset.id?choices.find(c=>c.id===el.dataset.id):null;
  if(el.dataset.id&&!selected)return true;
  if(selected&&a.sourceReference!==selected.sourceReference)a={};
  const card=selected||cards.find(c=>a.sourceReference?.startsWith(c.id+' / '))||cards.find(c=>c.has_pair)||cards[0];
  if(!card){show('<h2>我的 AI 留言判讀</h2><p>目前尚無你的圖卡與甲乙留言，請依老師指示確認。先不用填判讀。</p>'+(r?reading(r):''));return true;}
  const source=await api('aiReading',{readingId:card.id}),sourceReference=a.sourceReference||source.sourceReference||`${source.id} / W4 V${source.ordinal}`;
  const context=`<section aria-label="對照圖卡與甲乙留言"><h3>${source.isDemo?esc(source.label):`我的 W4 V${source.ordinal} 圖卡`}</h3>${source.taskNote?`<p class="notice">${esc(source.taskNote)}</p>`:''}<div class="ai-reading-image"><img src="${esc(source.imageUrl)}" alt="這次判讀對照的圖卡"></div>${source.commentA?`<div class="ai-reading-comments authored source-ai"><strong class="source-label">AI 材料 · 待你核對</strong><section><h3>甲</h3><p>${esc(source.commentA)}</p></section><section><h3>乙</h3><p>${esc(source.commentB)}</p></section></div>`:''}</section>`;
  if(!source.commentA||!source.commentB){show('<h2>先確認圖卡提醒</h2>'+context+'<p>這份圖卡目前只有提醒，尚無甲乙留言。請先依老師指示處理，不必自行編留言填答。</p>'+(r?reading(r):''));return true;}
  show(`<h2>我的 AI 留言判讀</h2><p>先讀完甲乙留言，逐句對照畫面，再摘出一句「黃｜待確認」或「紅｜有反證」的留言，不選整段。</p><p class="muted">不使用 AI 代答；兩項直接在這裡回覆。</p>${context}${choices.length>1?'<button class="secondary" data-action="aiJudgment" data-choose="true">改選另一份範例</button>':''}<form class="student-answer-form" id="aiJudgment" data-revision="${r?.revision||0}"><p class="source-label">我的作答 · 請自己填寫</p><input type="hidden" name="sourceReference" value="${esc(sourceReference)}"><fieldset><legend>1. AI 留言判讀｜找一句黃或紅</legend><label>摘自哪則留言？${select('comment',{'甲':'甲','乙':'乙'},a.comment)}</label><label>摘一句${area('quote',a.quote,1200)}</label><label>這一句的判斷${select('color',colors,a.color)}</label><label>畫面依據${area('evidence',a.evidence)}<small>寫出第幾格、哪個線索，說明它反駁哪個說法，或為什麼還不能確定。沒有支持，不等於有反證。</small></label></fieldset><fieldset><legend>2. 改後的一句｜保留有畫面依據的意思</legend><label>改後的一句${area('rewritten',a.rewritten)}<small>不要只加「可能」；刪掉沒有畫面依據的細節，或縮小這句話的範圍。</small></label></fieldset><p class="muted">AI 留言不代表真人已看懂。</p><p id="formStatus" role="status"></p><div class="row"><button name="status" value="draft" class="secondary">保存草稿</button><button name="status" value="submitted">送出判讀</button></div></form>`);return true;
 }
 async function submit(form,values,submitter){if(form.id!=='aiJudgment')return false;const answers=Object.fromEntries(['sourceReference','comment','quote','color','evidence','rewritten'].map(k=>[k,String(values.get(k)||'')]));const status=submitter?.value==='submitted'?'submitted':'draft';await api('saveAiJudgment',{activityId:state.activity,expectedRevision:Number(form.dataset.revision),status,answers},true);state.dirty=false;dialog.close();await board();say(status==='submitted'?'判讀已送出，再接著把文字畫成圖。':'草稿已保存，可以稍後繼續。');return true;}
 return {panel,action,submit,assessment};
}
