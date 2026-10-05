import {icon} from './visuals.js';
import {hasHumanFeedback} from './w4-progress.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const step=(who,title,detail,status,active=false)=>({who,title,detail,status,active});
const flow=(title,note,steps)=>`<section class="interaction-lane"><div class="interaction-heading"><h2>${title}</h2><p>${note}</p></div><ol class="interaction-steps">${steps.map(s=>`<li class="${s.active?'current':''}"><small>${icon(/圖卡|作品|選題/.test(s.title)?'image':/初讀|根據/.test(s.title)?'eye':/交還/.test(s.title)?'message':'pencil')}${s.who}</small><strong>${s.title}</strong><p>${s.detail}</p>${s.status?`<span>${s.status}</span>`:''}</li>`).join('')}</ol></section>`;
const jump=(title,section)=>`<button class="secondary" data-action="flowJump" data-section="${section}">${title}</button>`;
export function interactionFlow(b,teacher=false){const a=b.activity,w=b.works[0];if(a.archived||!['w4','w5-personal'].includes(a.kind))return '';
 if(a.kind==='w4'){
  const uploaded=!!w?.versions.length,human=hasHumanFeedback(w),decided=!!w?.decisions?.length;
  const reviews=b.reviews||[],pending=reviews.filter(r=>r.status==='assigned'),done=reviews.filter(r=>r.status==='done'),waiting=reviews.filter(r=>['waiting','requested'].includes(r.status));
  const canRead=!teacher&&a.accepting&&['review','exhibit'].includes(a.phase)&&pending.length>0;
  const author=flow(teacher?'作者的路徑':'我是作者','讀者的理解回到作者，再由作者決定',[
   step('作者 · 紙本 → 平台','保存自己的圖卡','原意與草圖留紙本；先只給讀者看圖。',teacher?'':uploaded?'V1 已保存':'尚未保存圖卡',!teacher&&!uploaded),
   step('讀者／老師 → 作者','收到真人初讀','獨立看圖，說出理解與畫面根據。',teacher?'':human?'真人初讀已收到':uploaded?'等待真人回饋':'先保存圖卡',!teacher&&uploaded&&!human),
   step('作者','說明修改或保留','對照原意與回饋；有修改才另存 V2。',teacher?'':decided?'本人決定已保存':human?'可以留下自己的理由':'收到回饋後接續',!teacher&&human&&!decided)]);
  const reader=flow(teacher?'讀者的路徑':'我是讀者','給另一位作者的回饋，另有自己的進度',[
   step('老師 → 讀者','看分派的作品','先只看圖，不先問作者原意。',teacher?'':reviews.length?'已有讀者任務':'等老師安排'),
   step('讀者','寫理解與畫面根據','不確定也照實說，讓作者知道你怎麼理解。',teacher?'':canRead?`${pending.length} 份可初讀`:waiting.length?'等待作品或老師協助':pending.length?'等待開放初讀':done.length?'初讀已送出':'尚無分派',canRead),
   step('讀者 → 作者','把初讀交還作者','作者收到後，自己決定改或留。','')]);
  return `<div class="interaction-map" aria-label="W4 作者與讀者流程"><p class="flow-guide-label">步驟說明 · 下方顯示的是操作指引，作答與回饋請到原作品查看</p>${author}${reader}${!teacher?`<div class="row interaction-actions">${jump(human?'看我的回饋與決定':'回自己的作品','human')}${jump(canRead?'去完成初讀':'查看初讀任務','reader')}</div>${!a.accepting?'<p class="muted">目前暫停保存；可以回看紀錄，需要補存請洽老師。</p>':''}`:''}</div>`;
 }
 const judgment=b.aiJudgments?.[0],materials=b.aiReadings?.some(r=>r.has_pair),uploaded=!!w?.versions.length,reflection=w?.reflection,submitted=reflection?.status==='submitted'&&reflection.versionId===w.current_version_id;
 return `<div class="interaction-map" aria-label="W5 兩段活動"><p class="flow-guide-label">步驟說明 · 作答紀錄與 AI 材料各自標示來源</p>${flow('① 查圖卡的 AI 留言','接回 W4–W5 同件作品評閱',[
 step('材料','圖卡＋甲乙留言','看自己的圖卡，或老師提供的練習範例。',teacher?'':materials?'材料可用':'等待提供可用材料'),
 step('本人','指出依據，改寫一句','選一句黃或紅，核對畫面與判色依據。',teacher?'':judgment?.status==='draft'?'已存草稿':judgment?.status==='submitted'?'判讀已送出':'尚未保存',!teacher&&materials&&judgment?.status!=='submitted'),
 step('本人','核對後送出','草稿與送出分開；AI 留言不能代替真人初讀。','')])}${!teacher?`<div class="row">${jump('看圖卡與我的判讀','judgment')}</div>`:''}${flow('② 把文字轉成圖','學習練習，不另計分',[
 step('本人 · 紙本 → 平台','選題、畫圖、讀回原文','找出關係，核對有沒有多畫或漏畫，再保存照片。',teacher?'':uploaded?'照片已保存':w?.topic?'已選題，接著作圖':'從選一題開始',!teacher&&!uploaded),
 step('同題同學 → 本人','看一件同題作品','沒有同題他作時先等同學或洽老師，不自行編回饋。',teacher?'':a.phase==='exhibit'?'可到同題展廳查看':'等老師開放展廳'),
 step('本人 · 自己作品旁','引用作品，寫 ORID','記具體所見、感受與想學的方法。',teacher?'':submitted?'已送出，對應目前版本':reflection?'核對草稿／對應版本後送出':'有作品可欣賞後接續',!teacher&&uploaded&&!submitted)])}${!teacher?`<div class="row">${jump(uploaded?'回看我的作品':'選題與保存作品','diagram')}${uploaded?jump('同題欣賞與 ORID','orid'):''}</div>`:''}</div>`;
}
