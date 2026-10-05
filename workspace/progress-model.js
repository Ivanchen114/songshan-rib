// Evidence presence describes progress, never quality or an automatic grade.
export function studentProgress(data,student,week=6){
 const activities=data.activities.filter(a=>a.week<=week),items=[];
 const record=a=>student.records.find(r=>r.activityId===a.id)||{};
 const add=(a,key,label,state,detail,scored=false)=>items.push({id:a.id+':'+key,key,activityId:a.id,week:a.week,label,statusLabel:state==='waiting'?({human:'待真人回饋',judgment:'待提供材料',reader:'初讀待開放',orid:a.phase!=='exhibit'?'展廳待開放':'待同題作品'}[key]||'等待回饋／開放'):state==='dependent'?({human:'先交圖卡',decision:'待真人回饋',orid:'先交文轉圖'}[key]||'先完成前一步'):state==='missing'&&(!a.accepting||a.archived)?'待開放補存':null,state:state==='missing'&&(!a.accepting||a.archived)?'blocked':state,detail,scored,archived:a.archived});
 const w5=activities.filter(a=>a.kind==='w5-personal'&&!a.archived);
 for(const a of activities){const r=record(a),uploaded=r.versionCount>0;
  if(data.collection&&a.kind==='w4'&&!a.archived){
   add(a,'image','W4 個人圖卡',uploaded?'done':'missing',uploaded?'已有保存版本':'上傳自己的圖卡；W5 示範不能代替原作。',true);
   add(a,'human','W4 真人初讀',r.humanFeedback?'done':uploaded?'waiting':'dependent',r.humanFeedback?'已有真人回饋':uploaded?'等候同學或老師親自看圖回饋；需要補讀可找老師。':'先上傳圖卡，再取得真人回饋。',true);
   if(uploaded&&!r.humanFeedback){const human=items.at(-1);human.statusLabel=r.humanReaderStatus==='assigned'?'待同學初讀':'待老師安排或補讀';}
   add(a,'decision','W4 我的改留理由',r.decision?'done':r.humanFeedback?'missing':'dependent',r.decision?'修改或有理由保留皆可':'收到真人回饋後，由本人留下修改或保留的依據。',true);
   if(!r.decision&&r.humanFeedback&&a.phase==='production'){items.at(-1).state='waiting';items.at(-1).statusLabel='等待開放改留';items.at(-1).detail='真人初讀已收到，等老師開放改留與保存後再接續。';}
   if(r.readerPending||r.readerTotal)add(a,'reader','我替同學的初讀',!r.readerPending?'done':a.phase==='production'||!r.readerReady?'waiting':'missing',!r.readerPending?'已送出所有已分派的初讀。':r.readerReady?`還有 ${r.readerReady} 份可初讀的作品；看圖、填寫理解與畫面根據，再送出。`:'初讀已安排，等待對方上傳作品或老師開放初讀。');
  }else if(data.collection&&a.kind==='w5-personal'&&!a.archived){
   add(a,'judgment','W5 AI 留言判讀',r.judgment==='submitted'?'done':r.materials?'missing':'waiting',r.judgment==='submitted'?'判讀已送出':r.judgment==='draft'?'已存草稿，完成後還要按送出。':r.materials?'對照圖卡與甲乙，留下判色依據及改後一句並送出。':'等待老師提供可用的圖卡與甲乙留言。',true);
   if(r.judgment==='draft'&&items.at(-1).state==='missing')items.at(-1).statusLabel='草稿・尚未送出';
   add(a,'diagram','W5 個人文字轉圖',uploaded?'done':'missing',uploaded?'個人圖已保存':'選一題、畫自己的圖，再上傳一張照片；不另計分。');
   const reflection=r.reflection?.status==='submitted'&&r.reflection.current;
   add(a,'orid','W5 同題欣賞與 ORID',reflection?'done':!uploaded?'dependent':a.phase!=='exhibit'||!r.peerAvailable?'waiting':'missing',reflection?'已保存並對應目前作品':r.reflection&&!r.reflection.current?'作品已更新，請核對原 ORID 再保存。':r.reflection?.status==='draft'?'ORID 目前是草稿，核對後送出。':!uploaded?'先保存圖，再引用同題作品。':a.phase!=='exhibit'?'等待老師開放同題展廳。':!r.peerAvailable?'同題尚無其他可讀作品，先等同學或請老師協助。':'欣賞並引用一件同題作品，回自己的作品寫三問；不另計分。');
   if(items.at(-1).state==='missing'&&r.reflection)items.at(-1).statusLabel=r.reflection.current?'草稿・尚未送出':'待核對目前版本';
  }else if(a.kind==='w8-materials'&&r.topic)add(a,'topic',a.title,'done','本組材料已分配；這裡只回看已有紀錄。');
  else if(uploaded)add(a,'work',a.title,'done','已有保存版本；這裡只回看紀錄，不按週次推定欠交。');
 }
 const w4=data.collection?activities.filter(a=>a.kind==='w4'&&!a.archived):[];
 const assessment=w4.length?w4.map(a=>{const r=record(a),judged=w5.some(b=>record(b).judgment==='submitted');return {activityId:a.id,state:r.graded?'graded':r.versionCount&&r.humanFeedback&&r.decision&&judged?'ready':'incomplete'};}):[];
 return {items,assessment,actionable:items.filter(i=>i.state==='missing'&&!i.archived),waiting:items.filter(i=>['waiting','blocked'].includes(i.state)&&!i.archived),needsEvidence:assessment.some(a=>a.state==='incomplete'),ready:assessment.some(a=>a.state==='ready'),graded:assessment.length>0&&assessment.every(a=>a.state==='graded')};
}
// Include the announced classroom practices and assigned reader tasks. A grade
// never substitutes for an outstanding submission; unrelated weeks stay out.
export function studentTaskSummary(p,collection){
 const items=p.items.filter(i=>collection?.weeks.includes(i.week)&&!i.archived);
 const actionable=items.filter(i=>i.state==='missing');
 const waiting=items.filter(i=>['waiting','blocked','dependent'].includes(i.state));
 const done=items.filter(i=>i.state==='done');
 const state=actionable.length?'missing':waiting.length||!items.length?'waiting':'done';
 return {items,actionable,waiting,done,state,title:state==='missing'?`還有 ${actionable.length} 項可完成`:state==='done'?'本次任務已交齊':'等待接續',detail:state==='missing'?`從下方選一項，直接回到填寫處。${waiting.length?`另有 ${waiting.length} 項需等候回饋、開放或前一步完成。`:''}`:state==='done'?'本次指定的作品、作答與已分派初讀都有紀錄；可回看內容與老師評閱。':items.length?'目前沒有可直接補寫的項目，請看下方原因；需要安排或開放時請找老師。':'目前無法核對本次任務，請更新紀錄或洽老師。'};
}
export function progressActionLabel(i){
 if(i.state==='done')return '查看紀錄';
 if(i.state!=='missing')return i.key==='reader'?'查看初讀任務':i.key==='human'?'查看初讀狀態':'查看等待原因';
 return {image:'上傳我的圖卡',decision:'填寫改留理由',judgment:'繼續判讀',diagram:'選題與上傳',orid:'去寫 ORID',reader:'完成初讀'}[i.key]||'前往填寫';
}
export function progressStatusLabel(i){
 if(i.statusLabel)return i.statusLabel;
 if(i.state==='done')return {human:'已收到真人初讀',judgment:'已送出',orid:'已送出・目前版本',reader:'已送出初讀'}[i.key]||'已保存';
 return {missing:'待本人完成',waiting:'等待回饋／材料',dependent:'先完成前一步',blocked:'待開放補存'}[i.state]||'待確認';
}
export function teacherNextStep(p){
 if(p.graded)return {label:'已評閱',needsAction:false};
 if(p.ready)return {label:'可評閱',needsAction:true};
 const missing=p.actionable.find(i=>i.scored);
 if(missing)return {label:'缺：'+missing.label,needsAction:true};
 const material=p.items.find(i=>i.scored&&i.key==='judgment'&&i.state==='waiting');
 if(material)return {label:'等老師：提供甲乙材料',needsAction:true};
 const blocked=p.waiting.find(i=>i.scored&&i.state==='blocked');
 if(blocked)return {label:'等老師：開放補存',needsAction:true};
 const human=p.items.find(i=>i.scored&&i.key==='human'&&i.state==='waiting');
 if(human)return {label:human.statusLabel==='待同學初讀'?'等同學初讀':'等老師：安排或補初讀',needsAction:human.statusLabel!=='待同學初讀'};
 return {label:'查看本人證據',needsAction:false};
}
