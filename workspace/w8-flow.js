// One W8 entry; group assignments and individual submissions keep their own records.
export const isW8 = a => ['w8-materials','w8-proposal'].includes(a?.kind);
export const W8_TITLE = 'W8 閱讀與個人提案';
export const W8_DESCRIPTION = '代表核對組員、抽題；每人先讀寫，再分享、寫提案，交流後各自上傳 p.2。';
const testOnly = a => Boolean(a.testOnly ?? a.test_only);
export function w8Pair(activities, a) {
  if (!isW8(a)) return {};
  const same = x => x.term === a.term && testOnly(x) === testOnly(a) && Boolean(x.archived) === Boolean(a.archived);
  const materials = a.kind === 'w8-materials' ? a : activities.find(x => same(x) && x.kind === 'w8-materials' && x.id === a.materialsActivityId);
  const proposals = materials ? activities.filter(x => same(x) && x.kind === 'w8-proposal' && x.materialsActivityId === materials.id) : [];
  const proposal = a.kind === 'w8-proposal' ? a : proposals.length === 1 ? proposals[0] : undefined;
  return {materials,proposal};
}
export function mergeW8Entries(activities) {
  return activities.filter(a => a.kind !== 'w8-proposal' || !w8Pair(activities,a).materials || w8Pair(activities,w8Pair(activities,a).materials).proposal?.id !== a.id);
}
export function w8EntryStatus(activities,a) {
  const {materials,proposal}=w8Pair(activities,a);
  if(a.archived)return '已封存';
  return `抽題${materials?.accepting?'已開放':'未開放'} · 交件${proposal?.accepting?'已開放':'未開放'}`;
}
export function w8ProposalState(b,materialsBoard) {
  const w=b.works[0],hasUpload=Boolean(w?.versions.length);
  const topic=materialsBoard?.works[0]?.topic;
  if(hasUpload)return {title:'提案已保存，請打開照片確認',description:'確認整頁 p.2、同學實際問句及自己修改或保留的理由都清楚。確認後，四頁歷程本整本交回。',canStart:false};
  if(!topic)return {title:'先完成本組抽題',description:'回到「① 小組抽題與閱讀」，請代表核對組員並抽題。你加入正確小組後，會看到同一份材料。',canStart:false};
  if(b.activity.archived||!b.activity.accepting)return {title:'先完成紙本，等待老師開放交件',description:'先寫 p.2 提案，跨題交流後記下同學的實際問句，以及自己修改或保留的理由。老師開放後，每人再上傳自己的整頁照片。',canStart:false};
  return {title:'交流後，每人上傳自己的 p.2',description:'先完成紙本提案與跨題交流，在 p.2 記下實際問句及修改或保留的理由，再拍清楚整頁。',canStart:!w};
}
export function createW8FlowUI({state,esc,button,workCard,boardTools}) {
  function nav(b) {
    if(!isW8(b.activity))return '';
    const a=b.activity,materials=a.kind==='w8-materials',other=b.relatedActivityId;
    const step=(id,label,current)=>`<button type="button" class="${current?'':'secondary'}" ${current?'aria-current="step"':''} ${id?`data-action="activity" data-id="${esc(id)}"`:'disabled'}>${label}${current?' · 目前頁面':''}</button>`;
    return `<nav class="w8-steps" aria-label="W8 兩個步驟">${step(materials?a.id:other,'① 小組抽題與閱讀',materials)}${step(materials?other:a.id,'② 我的提案',!materials)}</nav>`;
  }
  function proposal(b) {
    const s=w8ProposalState(b,state.w8MaterialsBoard),w=b.works[0],topic=state.w8MaterialsBoard?.works[0]?.topic;
    return `<section class="next-step"><div><p class="eyebrow">現在要做什麼</p><h2>${esc(s.title)}</h2><p>${esc(s.description)}</p></div></section><section id="studentWork" class="panel" aria-label="我的提案">${w?workCard(w,false):`<h3>每人交一份自己的提案</h3><p>${topic?'沿用本組題材 '+esc(topic)+'，不用重新抽題。':'組員共用題材，每人各寫、各交自己的提案。'}</p>${s.canStart?button('紙本與交流已完成，上傳我的 p.2','w8StartUpload'):!topic&&b.relatedActivityId?button('回到① 核對組員與抽題','activity',`data-id="${esc(b.relatedActivityId)}"`):''}`}</section><section id="studentReader" hidden></section><p class="notice">只填提案名稱，附一張完整 p.2 照片；問句與修改或保留的理由留在紙上，不用另寫 ORID，也不用重傳 Classroom。</p><details><summary>查看課程展廳</summary>${boardTools(b.activity)}</details>`;
  }
  return {nav,proposal};
}
