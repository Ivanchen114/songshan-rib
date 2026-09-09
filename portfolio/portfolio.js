(()=>{'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config,loading=false;const term=s=>/^(\d{3})0([12])$/.test(s)?s.slice(0,3)+' 學年度'+(s.endsWith('1')?'上':'下')+'學期':s||'公開作品';
const entry=args=>config.gasUrl+'#'+new URLSearchParams(args);const badge=w=>w?'W'+w:'作品';
function render(d){
 const groups=[...new Set(d.collections.map(c=>c.term))];
 $('#publicCollections').innerHTML=groups.length?groups.map(t=>`<h3 class="term-heading">${esc(term(t))}</h3><div class="collection-grid">${d.collections.filter(c=>c.term===t).map(c=>`<a class="collection-entry" href="${esc(entry({history:c.id}))}" target="_blank" rel="noopener noreferrer"><span class="week-label">${badge(c.week)}</span><div><h3>${esc(c.title)}</h3><p>${c.count} 份匿名作品</p><span class="entry-action">看作品 →</span></div></a>`).join('')}</div>`).join(''):'<div class="catalog-status"><strong>作品準備中</strong>老師開放後，你就能在這裡看見作品。</div>';
 $('#courseEntries').innerHTML=d.courses.length?d.courses.map(c=>{const body=`<span class="week-label">${badge(c.week)}</span><div><p class="eyebrow">${esc(term(c.term))}</p><h3>${esc(c.title)}</h3><span class="entry-action">${c.accepting?'進入課堂 →':'暫停上傳'}</span></div>`;return c.accepting?`<a class="course-entry" data-course="${esc(c.code)}" href="${esc(entry({code:c.code}))}" target="_blank" rel="noopener noreferrer">${body}</a>`:`<div class="course-entry paused">${body}</div>`;}).join(''):'<p class="catalog-status">目前沒有開放的課堂入口。</p>';
}
async function load(){if(loading)return;loading=true;$('#reloadCatalog').disabled=true;
 try{config||=await(await fetch('config.json')).json();const response=await fetch('/api/portfolio',{cache:'no-store',signal:AbortSignal.timeout(15000)}),r=await response.json();if(!response.ok||!r.ok||!Array.isArray(r.data?.collections)||!Array.isArray(r.data?.courses))throw Error('unavailable');render(r.data);}
 catch{$('#publicCollections').innerHTML='<div class="catalog-status"><strong>公開作品暫時無法載入</strong>請稍後按「重新整理」。學生仍可使用下方已設定的課堂入口。</div>';}
 finally{loading=false;$('#reloadCatalog').disabled=false;}
}
$('#reloadCatalog').addEventListener('click',load);load();
})();
