import {ACTIVITY,supportedKind,isGroup} from './activities.js';
// Presentation only. Authorization and learning transitions remain server-owned.
const migrationReadOnly = (a,config) => config?.acceptanceOnly && !a.accepting && !(a.testOnly ?? a.test_only);
export const phaseLabel = (a,config) => a.archived ? '已封存' : !a.accepting ? (migrationReadOnly(a,config)?'搬遷資料・僅供查閱':'尚未開放交件') : ({production:'製作與上傳',review:'初讀與改留',exhibit:'課程展示'}[a.phase] || '查閱作品');
export const supported = a => supportedKind(a.kind);
export function workFlags(w,b) {
  return {uploaded:!!w.versions.length, feedback:!!w.feedback.length,
    unpaired:b.activity.kind==='w4'&&!b.reviews.some(r=>r.target_work_id===w.id),
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
export function studentNext(b,config) {
  const a=b.activity,w=b.works[0];
  if(a.archived)return ['本週已封存','作品與回饋保留在這裡，現在可以查閱。'];
  if(!supported(a))return ['查閱以前的作品','這個活動保留原系統紀錄；此為早期課程活動，原檔與歷程保留在這裡。'];
  if(migrationReadOnly(a,config))return ['這是搬遷資料，目前僅供查閱',`驗收期間尚未開放這個正式活動交件。要練習上傳與操作，請回「課堂活動」，選擇名稱有「【測試】」的 W${a.kind==='w4'?'4':'5'} 活動。`];
  if(!a.accepting)return ['這個活動尚未開放交件','目前可查閱已有作品與回饋；開放後才能上傳或保存新內容。'];
  if(b.invitations.length)return ['先確認小組邀請','核對同組同學後，再加入共同作品。'];
  if(b.reviews.some(r=>r.status==='assigned')&&['review','exhibit'].includes(a.phase))return ['有一份初讀等你完成','切換「我的初讀任務」，先看圖，再寫出你的理解與根據。'];
  if(a.kind!=='w4'&&a.kind!=='w5-workshop')return [w?.versions.length?'作品與歷程已保存':isGroup(a.kind)?'先確認小組，再保存作品':'先保存我的作品',ACTIVITY[a.kind].description];
  if(!w?.versions.length)return [a.kind==='w4'?'先保存我的圖卡':'先保存小組的兩張 A3',a.kind==='w4'?'原意留在歷程本，這裡只上傳圖卡。':'同組交一份，組員先確認加入，再上傳 A、B 題照片。'];
  if(w.feedback.length&&!w.decisions.length&&a.kind==='w4'&&['review','exhibit'].includes(a.phase))return ['同學的初讀回來了','比對原意與畫面，再決定修改，或有理由地保留。'];
  if(!w.feedback.length&&a.kind==='w4')return ['作品已保存，等候同學初讀','你的作品與讀者任務分開進行，可以先查看自己的初讀任務。'];
  return ['作品與歷程已保存','可查看版本、回覆同學，或調整這份作品的公開設定。'];
}
