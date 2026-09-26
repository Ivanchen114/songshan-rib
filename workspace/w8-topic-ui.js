import {w8Topic} from './w8-topics.js';
export function createW8TopicUI({state,api,esc,board,say}){
 function panel(){
  const b=state.board,w=b.works[0],t=w8Topic(w?.topic),open=b.activity.accepting&&!b.activity.archived;
  return `<section class="topic-summary" aria-label="本組題材"><h3>${t?'本組題材 · '+esc(t.id):'代表核對組員後，抽一份題材'}</h3>${t?`
   <p class="topic-title">${esc(t.title)}</p><p>寫給${esc(t.audience)}：${esc(t.question)}</p>
   <p><a class="button" href="../W8/materials.html#${esc(t.id)}" target="_blank" rel="noopener noreferrer">打開本組原文與閱讀範圍 ↗</a></p>
   <ol class="w8-reading-steps">
    <li><strong>每人先讀、先寫｜12 分鐘</strong><br>讀本組原文，把引用的原句、條件、還不知道的事、目標及甲乙兩種做法，寫在 p.1 第 01–03 題。</li>
    <li><strong>組內分享與核對｜6 分鐘</strong><br>四人各用 1 分鐘指著原文，說明自己的目標與兩種做法；再一起用 2 分鐘核對疑問。不投票選共同方案。</li>
    <li><strong>各自補記｜1 分鐘</strong><br>在 p.1 第 04 題寫下自己修正或保留了什麼，以及理由。</li>
   </ol>
   <p><strong>接下來先在紙上做：</strong>每人從甲乙做法選一種，在 p.2 完成自己的提案；依簡報跨題交流，記下實際問句及修改或保留的理由，再到「② 我的提案」上傳。</p>
   <details><summary>交流前，怎麼寫自己的代號？</summary><p>老師指定①／②／③後，原組四人自行分好 A、B、C、D，一人一個。每人把完整代號寫在 p.2 空白角落，例如 ${esc(t.id)}-①-A；①與 A 請換成自己的代號。</p></details>
   <p class="muted">題材已保存，同組每人登入都看得到；重新整理不會換題。抽題完成不代表個人提案已交件。</p>`:`
   <p>${w?'先核對上方本組姓名。代表確認正確後抽一次，其他組員不用再抽。':'先由一位代表建立本組名單，加入同班組員；其他人不用各建一組。'}</p>
   ${w&&open?'<button data-action="drawW8Topic">我是代表，名單正確，抽本組題材 →</button><p class="muted">其他組員等代表抽完後，按上方「更新」即可，不用再抽。</p>':'<p class="muted">'+(!open?'老師尚未開放組隊與抽題，請先依簡報進行課堂活動。':'代表請先按上方「我是代表，建立本組名單」。')+'</p>'}
   <details><summary>題材怎麼分配？</summary><p>系統均衡分配六種題材；同一活動 18 組全部抽完後，每題 3 組。抽題後不能重抽，請先核對組員。</p></details>`}</section>`;
 }
 async function action(el){if(el.dataset.action!=='drawW8Topic')return false;const w=state.board.works[0];el.disabled=true;try{await api('drawTopic',{workId:w.id,expectedRevision:w.revision},true);await board();window.scrollTo(0,0);say('本組題材已保存。每人先讀原文，完成 p.1 第 01–03 題，再組內分享。');}finally{el.disabled=false;}return true;}
 return {panel,action};
}
