(()=>{'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config,loading=false;const term=s=>/^(\d{3})0([12])$/.test(s)?s.slice(0,3)+' 學年度'+(s.endsWith('1')?'上':'下')+'學期':s||'公開作品';
const entry=args=>config.gasUrl+'#'+new URLSearchParams(args);const badge=w=>w?'W'+w:'作品';
function render(d){
 const collections=[...d.collections,...(d.exhibits||[]).map(x=>({...x,exhibit:true,count:1}))];const groups=[...new Set(collections.map(c=>c.term))].sort().reverse();
 $('#publicCollections').innerHTML=groups.length?groups.map(t=>`<h3 class="term-heading">${esc(term(t))}</h3><div class="collection-grid">${collections.filter(c=>c.term===t).map(c=>`<a class="collection-entry" href="${esc(entry(c.exhibit?{exhibit:c.id}:{history:c.id}))}" target="_blank" rel="noopener noreferrer"><span class="week-label">${badge(c.week)}</span><div><h3>${esc(c.title)}</h3><p>${c.count} 份匿名作品</p><span class="entry-action">看作品 →</span></div></a>`).join('')}</div>`).join(''):'<div class="catalog-status"><strong>作品準備中</strong>老師開放後，你就能在這裡看見作品。</div>';
 const rooms=config.courses.map(room=>({...room,...d.courses.find(c=>c.week===room.week),legacyCode:room.code}));
 $('#courseEntries').innerHTML=rooms.map(c=>{const args={week:c.week};if(c.legacyCode)args.code=c.legacyCode;return `<a class="course-entry" data-course="w${c.week}" href="${esc(entry(args))}" target="_blank" rel="noopener noreferrer"><span class="week-label">${badge(c.week)}</span><div><p class="eyebrow">${c.term?esc(term(c.term)):'固定展廳'}</p><h3>${esc(c.title)}</h3><span class="entry-action">進入展廳 →</span>${c.accepting===false?'<p>尚未開放上傳</p>':''}</div></a>`;}).join('');

}
async function load(){if(loading)return;loading=true;$('#reloadCatalog').disabled=true;
 try{config||=await(await fetch('config.json')).json();const requested=Number(new URLSearchParams(location.search).get('week'));if(config.courses.some(c=>c.week===requested)){location.replace(entry({week:requested}));return;}render({courses:[],collections:[]});const response=await fetch('/api/portfolio',{cache:'no-store',signal:AbortSignal.timeout(15000)}),r=await response.json();if(!response.ok||!r.ok||!Array.isArray(r.data?.collections)||!Array.isArray(r.data?.courses))throw Error('unavailable');render(r.data);}
 catch{$('#publicCollections').innerHTML='<div class="catalog-status"><strong>公開作品暫時無法載入</strong>請稍後按「重新整理」。學生仍可使用下方已設定的課堂入口。</div>';}
 finally{loading=false;$('#reloadCatalog').disabled=false;}
}
$('#reloadCatalog').addEventListener('click',load);load();
})();
