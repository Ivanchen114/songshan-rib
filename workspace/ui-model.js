import {ACTIVITY,supportedKind,isGroup} from './activities.js';
// Presentation only. Authorization and learning transitions remain server-owned.
const migrationReadOnly = (a,config) => config?.acceptanceOnly && !a.accepting && !(a.testOnly ?? a.test_only);
export const phaseLabel = (a,config) => a.kind==='w8-proposal'?(a.archived?'已封存':a.accepting?'個人交件已開放':'個人交件尚未開放'):a.kind==='w8-materials'?(a.archived?'已封存':a.accepting?'組隊與抽題已開放':'組隊與抽題尚未開放'): a.archived ? '已封存' : !a.accepting ? (migrationReadOnly(a,config)?'搬遷資料・僅供查閱':'尚未開放交件') : ({production:'製作與上傳',review:'初讀與修改或保留',exhibit:'課程展示'}[a.phase] || '查閱作品');
export const supported = a => supportedKind(a.kind);
export function workFlags(w,b) {
  return {uploaded:!!w.versions.length, feedback:w.hasHumanFeedback??!!w.feedback.length,
    unpaired:b.activity.kind==='w4'&&!w.hasHumanFeedback&&!b.reviews.some(r=>r.target_work_id===w.id),
    moderation:w.publications.some(p=>p.status==='published'&&!p.reviewed_by),
    ungraded:!!w.versions.length&&!w.grades.some(g=>g.status==='graded')};
}
export function matchesWork(w,b,filter='all',query='') {
  const f=workFlags(w,b),q=query.trim().toLowerCase();
  const match=!q||w.members.some(m=>m.status==='confirmed'&&[m.name,m.student_id,String(m.seat),`${m.seat}號`].some(v=>String(v).toLowerCase().includes(q)));
  return match && ({all:true,missing:!f.uploaded,feedback:f.uploaded&&!f.feedback,unpaired:f.unpaired,moderation:f.moderation,ungraded:f.ungraded}[filter]??true);
}
export function missingStudents(roster,b) {
  const submitted=new Set(b.works.filter(w=>w.versions.length).flatMap(w=>w.members.filter(m=>m.status==='confirmed').map(m=>m.student_id)));
  return roster.filter(s=>s.active&&s.is_test===b.activity.testOnly&&!submitted.has(s.student_id));
}
export const reflectionNeedsReview = w => !!w?.reflection && w.reflection.versionId!==w.current_version_id;
export function studentNext(b,config) {
  const a=b.activity,w=b.works[0];
  if(a.archived)return ['本週已封存','作品與回饋保留在這裡，現在可以查閱。'];
  if(!supported(a))return ['查閱以前的作品','這個活動保留原系統紀錄；此為早期課程活動，原檔與歷程保留在這裡。'];
  if(migrationReadOnly(a,config))return ['這是搬遷資料，目前僅供查閱',`驗收期間尚未開放這個正式活動交件。要練習上傳與操作，請回「課堂活動」，選擇名稱有「【測試】」的 W${a.kind==='w4'?'4':'5'} 活動。`];
  if(a.kind==='w9-check')return !a.accepting?['目前僅供查閱','老師開放交件與保存後，可以補傳或修改 ORID。']:!w?.versions.length?['保存資料依據、提案與思考紀錄','貼入核對後的來源與原文，寫自己的提案，附一張 p.1；學科題留紙本。']:reflectionNeedsReview(w)?['作品已更新，核對原 ORID','舊反思仍保留原版本；確認內容後保存，才對應新版本。']:w.reflection?.status==='submitted'?['作品與 ORID 已保存','下次可以回看查核依據、自己的決定與學習發現。']:['作品已保存，接著寫自己的 ORID','選今天課堂中的一件事：描述事情、寫自己的感受，再想對學習的啟發與應用。'];
  if(a.kind==='w8-proposal')return w?.versions.length?['提案已保存，打開照片最後確認','原稿、真實問句與修改或保留的理由都要清楚；不用再傳 Classroom，也不必另填反思。']:['交流後，交自己的提案書','先在紙本 p.2 留下真實問句與自己修改或保留的理由，再拍完整一頁上傳；題材自動沿用本組抽題。'];
  if(a.kind==='w8-materials')return w?.topic?['本組題材已保存，每人開始讀原文','先自己完成 p.1 第 01–03 題，再組內分享並補記第 04 題；接著每人寫 p.2 提案，完成後跨題交流。']:a.accepting?['先核對組員，再抽題','六題均衡隨機分配；同組共用材料，重整不會換題。']:['題材分配尚未開放','老師開放後，由代表建立小組並核對姓名。'];
  if(!a.accepting)return ['這個活動尚未開放交件','目前可查閱已有作品與回饋；開放後才能上傳或保存新內容。'];
  if(a.kind==='w5-personal'&&b.aiReadings?.some(r=>r.has_pair)&&b.aiJudgments&&!b.aiJudgments.some(r=>r.status==='submitted'))return ['先留下自己的 AI 留言判讀','對照老師提供的圖卡與甲乙留言，在下方找一句黃或紅的留言，保存判讀與改寫，接著把文字畫成圖。'];
  if(a.kind==='w5-personal')return !w?.topic?['先選這次要畫的題目','先讀題目與原文，從 A、B 兩區選一題；每人完成自己的一張圖。']:!w.versions.length?['題目已選好，接著完成並上傳一張圖','在歷程本 p.3 的大框完成作品，回原文核對，再拍圖上傳。']:reflectionNeedsReview(w)?['作品已更新，回看原 ORID','原反思保留在先前版本；請對照新圖核對內容，需要沿用到目前版本時再保存。']:w.reflection?.status==='submitted'?['作品與 ORID 已保存','可以回看同學的圖與自己的發現；不需要再寫紙本紀錄。']:['作品已保存，欣賞同題後寫 ORID','到課程展廳選同一題，引用一件同學作品，再回自己的作品寫三問反思。'];
  if(a.kind==='w7-news')return !w?.topic?['先核對本組名單，再抽一份材料','代表建立小組、加入組員後抽題；每組一題，分配結果會保存。']:!w.versions.length?['一起讀新聞與研究，畫一張圖卡','題材已分配。一起選主張、分工核對並畫圖；同題組交流後，由代表上傳最後圖卡與一則ORID交流紀錄。']:['到展廳比較同題作品','篩選本組題材，看看別組選了哪些依據、結論說到哪裡、怎麼畫；本組的ORID交流紀錄已隨作品保存。'];
  if(b.invitations.length)return ['小組名單更新中','請稍後更新作品與回饋，不用逐人確認加入。'];
  if(b.reviews.some(r=>r.status==='assigned'&&!r.teacherCovered)&&['review','exhibit'].includes(a.phase))return ['有一份初讀等你完成','切換「我的初讀任務」，先看圖，再寫出你的理解與根據。'];
  if(a.kind!=='w4'&&a.kind!=='w5-workshop')return [w?.versions.length?'作品與歷程已保存':isGroup(a.kind)?'先核對本組名單，再保存作品':'先保存我的作品',ACTIVITY[a.kind].description];
  if(!w?.versions.length)return [a.kind==='w4'?'先保存我的圖卡':'先保存小組的兩張 A3',a.kind==='w4'?'原意留在歷程本，這裡只上傳圖卡。':'代表加入組員後，同組交一份 A、B 題照片。'];
  if((w.hasHumanFeedback??w.feedback.length)&&!w.decisions.length&&a.kind==='w4'&&['review','exhibit'].includes(a.phase))return ['收到真人回饋了','比對原意與畫面，再決定修改，或有理由地保留。'];
  if(!(w.hasHumanFeedback??w.feedback.length)&&a.kind==='w4')return ['作品已保存，等候同學初讀','你的作品與讀者任務分開進行，可以先查看自己的初讀任務。'];
  return ['作品與歷程已保存','可查看版本、回覆同學，或調整這份作品的公開設定。'];
}
