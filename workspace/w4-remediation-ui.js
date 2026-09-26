export function createW4RemediationUI({state,api,show,esc,images,board,say,dialog}){
 const human=w=>w.hasHumanFeedback??!!w.feedback.length;
 function status(w){if(!w.versions.length)return '作品未交';if(!human(w))return '待初讀';if(!w.decisions.length)return '待本人修改或保留';return w.grades.some(g=>g.status==='graded')?'已評閱':'待教師核對';}
 function feedback(w){return (w.teacherReadings||[]).map(r=>`<div class="feedback"><strong>${esc(r.attribution)} · V${w.versions.find(v=>v.id===r.versionId)?.ordinal||'？'}</strong><p>情境與畫面依據：${esc(r.situation)}</p><p>意思與判斷依據：${esc(r.meaning)}</p>${r.sourceNote?`<p>判讀補充：${esc(r.sourceNote)}</p>`:''}${r.mode==='ai-simulation'?'<p class="muted">這是 AI 模擬，不能當作真人已看懂的證據。</p>':''}</div>`).join('');}
 function workTools(w,teacher){if(state.board.activity.kind!=='w4')return '';return `<p><span class="tag">${status(w)}</span></p>${feedback(w)}${teacher&&w.versions.length&&!state.board.activity.archived&&state.board.activity.accepting&&['review','exhibit'].includes(state.board.activity.phase)?`<button class="secondary" data-action="teacherReading" data-id="${esc(w.id)}">由老師補上初讀</button>`:''}${!teacher&&human(w)&&!w.decisions.length?'<p class="notice">請自己對照回饋、原本想表達的意思與畫面線索，決定修改或保留，並說明理由。保留請按「有理由保留目前版本」；修改請上傳 V2，填寫修改依據。不使用 AI 代答。</p>':''}`;}
 function reminders(link=true){return (state.home.reminders||[]).map(r=>`<section class="panel notice" aria-label="W4 補交提醒"><h2>W4 作品待補交</h2><p>${esc(r.message)}</p>${r.deadline?`<p><strong>補交日期：${esc(r.deadline)}</strong></p>`:''}${link?`<button data-action="activity" data-id="${esc(r.activityId)}">補交 W4 作品</button>`:'<p>閱讀並確認下方登入說明後，即可進入作品區補交。</p>'}</section>`).join('');}
 async function action(el){
  if(el.dataset.action==='rotateReading'){const img=document.getElementById(el.dataset.id);const angle=(Number(img.dataset.angle||0)+90)%360;img.dataset.angle=angle;img.style.transform=`rotate(${angle}deg)`;return true;}
  if(el.dataset.action==='reminderPlan'){
   show(`<h2>提醒未交者補交 W4</h2><p>查詢目前這一班仍未上傳圖片的學生。相同提醒不重複發送；補交後，學生首頁會自動移除提醒。空白或看不清的圖片仍由老師另行核對。</p><form id="reminderPreview"><label>補交日期（選填；留白依老師公告）<input type="date" name="deadline"></label><p id="formStatus"></p><button>查看未交名單與提醒內容</button></form>`);return true;
  }
  if(el.dataset.action==='sendReminders'){
   const r=await api('sendReminders',state.reminderPlan,true);state.reminderPlan=null;state.dirty=false;dialog.close();await board();say(`已將補交提醒放入 ${r.sent} 位學生的個人首頁；同內容已發 ${r.alreadySent} 位。`);return true;
  }
  if(el.dataset.action==='teacherReading'){
   const r=await api('teacherReading',{workId:el.dataset.id}),v=r.versions.at(-1),d=r.draft||{};
   if(!v)return true;
   show(`<h2>由老師補上初讀</h2><p>請先親自看 V${v.ordinal} 圖卡，再填寫你讀到的情境、意思與畫面依據。看不懂就寫出不確定之處，不補猜情節。AI 草稿可貼入下方再修改。</p><div id="teacherReadingImage"></div>${d.versionId&&d.versionId!==v.id?'<p class="notice">圖卡已更新，下面保留的是舊版草稿。請重新核對後再保存。</p>':''}<form id="teacherReading" data-id="${esc(r.workId)}" data-version="${esc(v.id)}" data-revision="${r.revision}"><label>回饋來源<select name="mode"><option value="human" ${d.mode!=='ai-simulation'?'selected':''}>老師親自看圖的初讀</option><option value="ai-simulation" ${d.mode==='ai-simulation'?'selected':''}>AI 模擬初讀（不算真人初讀）</option></select></label><label><input type="checkbox" name="aiAssisted" ${d.aiAssisted?'checked':''}>老師初讀的文字有使用 AI 協助整理</label><label>我讀到的情境與畫面依據<textarea name="situation" maxlength="1200">${esc(d.situation||'')}</textarea></label><label>我讀到的意思與判斷依據<textarea name="meaning" maxlength="1200">${esc(d.meaning||'')}</textarea></label><label>判讀補充（選填；會給學生看）<textarea name="sourceNote" maxlength="1200">${esc(d.sourceNote||'')}</textarea><small>只記錄實際發生的師生或師生與 AI 互動；只有 AI 判讀時，不寫成老師共同判讀。</small></label><label><input type="checkbox" name="personallyRead">我已親自看圖，確認上面的情境、意思與依據是我的判讀（發布老師初讀必勾）</label><label><input type="checkbox" name="reviewed">我已審閱這份 AI 模擬內容（只發布 AI 模擬時必勾）</label><p>草稿只有老師看得到。發布後保留原文，再次發布會新增一則，不會覆蓋同學的回饋；學生仍須自己說明修改或保留的理由。</p><p id="formStatus" role="status"></p><div class="row"><button name="status" value="draft" class="secondary">保存草稿</button><button name="status" value="published">確認並發布回饋</button></div></form>`);
   const media=await api('media',{versionId:v.id});
   document.querySelector('#teacherReadingImage').innerHTML=media.images.map((m,i)=>`<div><button type="button" class="secondary" data-action="rotateReading" data-id="readingImage${i}">第 ${i+1} 張旋轉 90°</button><div style="aspect-ratio:1;max-width:720px;margin:1rem auto"><img id="readingImage${i}" src="${esc(m.url)}" alt="W4 V${v.ordinal} 第 ${i+1} 張" style="width:100%;height:100%;object-fit:contain"></div><a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">另開原尺寸圖片</a></div>`).join('');return true;
  }
  return false;
 }
 async function submit(form,values,submitter){
  if(form.id==='reminderPreview'){
   const plan=await api('reminderPlan',{activityId:state.activity,className:state.className,deadline:String(values.get('deadline')||'')});state.reminderPlan=plan;state.dirty=false;
   show(`<h2>確認 W4 補交提醒</h2><p>${esc(plan.term)} 學期 · ${esc(plan.className)} 班</p><p>${esc(plan.message)}</p><p>補交日期：${esc(plan.deadline||'依老師公告')}</p><h3>本次發送 ${plan.candidates.length} 人</h3><ul>${plan.candidates.map(s=>`<li>${s.seat} 號 ${esc(s.name)}</li>`).join('')}</ul><p>相同內容已發 ${plan.alreadySent} 人；學生補交後會自動解除首頁提醒。這是在平台個人首頁顯示，不是電子郵件。</p>${plan.missing.length?`<details><summary>全部未交者與最近發送時間</summary><ul>${plan.missing.map(s=>`<li>${s.seat} 號 ${esc(s.name)}：${s.lastSentAt?esc(new Date(s.lastSentAt).toLocaleString('zh-TW')):'尚未提醒'}</li>`).join('')}</ul></details>`:''}${plan.candidates.length?'<button data-action="sendReminders">確認發出補交提醒</button>':'<p>目前不需新增提醒。</p>'}`);return true;
  }
  if(form.id!=='teacherReading')return false;
  const status=submitter?.value==='published'?'published':'draft';
  await api('saveTeacherReading',{workId:form.dataset.id,versionId:form.dataset.version,expectedRevision:Number(form.dataset.revision),status,...Object.fromEntries(['mode','situation','meaning','sourceNote'].map(k=>[k,String(values.get(k)||'')])),aiAssisted:values.has('aiAssisted'),personallyRead:values.has('personallyRead'),reviewed:values.has('reviewed')},true);
  state.dirty=false;dialog.close();await board();say(status==='published'?'回饋已發布；學生自己的修改或保留決定仍待本人完成。':'補讀草稿已保存，學生尚看不到。');return true;
 }
 return {status,feedback,workTools,reminders,action,submit};
}
