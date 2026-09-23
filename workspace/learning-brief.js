// Short learning cues shared by the workspace and the course exhibition.
// These explain existing activities; they do not add submissions or assessment rules.
const BRIEFS = Object.freeze({
 'w3-rebuild': {
  goal:'選出關鍵細節，把畫面中的人物、位置與動作說清楚。',
  check:'對照原圖與生成圖：哪些描述幫助重建？哪裡還需要說得更明確？'
 },
 'w3-personal': {
  goal:'用具體細節寫清楚一件事，再看看文字如何成為畫面。',
  check:'讀短文、看圖片，找出對得上的細節，以及圖片多加或漏掉的內容。'
 },
 'w4': {
  goal:'用畫面線索表達原意，看看讀者實際讀到了什麼。',
  check:'讀者先只看圖，說出理解與根據；作者再對照原意，決定修改或有理由地保留。'
 },
 'w5-workshop': {
  goal:'把文字中的重要關係畫清楚，讓別人看圖也能理解。',
  check:'請同學先只看圖說回內容，再對照原文，檢查有沒有多畫或漏掉重要關係。'
 },
 'w7': {
  goal:'看懂同一事件的不同呈現，讓自己的圖文有來源、說得準。',
  check:'留意選了哪些資訊、怎麼排列；聽完讀者回報，再回到來源決定改或留。'
 },
 'w15-deck': {
  goal:'讓讀者看懂公共問題的主張、根據，以及資料能說到哪裡。',
  check:'請讀者說回這三件事，找出理解落差；試讀與提問後，保留修訂或沿用的理由。'
 },
 'w18': {
  goal:'回看這學期的作品，選擇自己願意分享的理解與表達。',
  check:'想參與時，先看清楚作品與版本，再自願選零至三件；不必重傳或另寫心得。'
 }
});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function learningBrief(kind){
 const b=BRIEFS[kind];
 return b ? `<div class="learning-brief"><p><strong>${kind==='w18'?'這次回看':'這週練什麼'}</strong><span>${esc(b.goal)}</span></p><p><strong>${kind==='w18'?'怎麼選':'怎麼檢查'}</strong><span>${esc(b.check)}</span></p></div>` : '';
}
