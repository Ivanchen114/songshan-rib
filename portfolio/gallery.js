/* Shared public gallery. Source: GAS/src/Gallery.html; website copy is generated. */
(()=>{'use strict';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.createArtworkGallery=function({root,request,open}){
 let generation=0,cursor=null,busy=false,disposed=false,active=0,count=0;const queue=[],seen=new Set();
 root.innerHTML=`<form class="gallery-filters"><label>學期<input name="term" inputmode="numeric" pattern="[0-9]{3}0[12]" maxlength="5" placeholder="全部／例如11501"></label><label>週次<select name="week"><option value="">全部週次</option>${Array.from({length:18},(_,i)=>`<option value="${i+1}">W${i+1}</option>`).join('')}</select></label><button type="submit">查看展區</button></form><p class="gallery-status" role="status">正在載入作品……</p><div class="artwork-grid"></div><div class="gallery-controls"><button type="button" class="gallery-more" hidden>載入更多作品</button><button type="button" class="gallery-retry" hidden>重試這一批</button></div>`;
 const form=root.querySelector('form'),grid=root.querySelector('.artwork-grid'),status=root.querySelector('.gallery-status'),more=root.querySelector('.gallery-more'),retry=root.querySelector('.gallery-retry');let filters={term:'',week:''};
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);enqueue(e.target);}},{rootMargin:'240px'}):null;
 const current=(node,g)=>!disposed&&g===generation&&node.isConnected&&root.contains(node);
 function enqueue(img){if(!img.src&&!img.dataset.queued){img.dataset.queued='1';queue.push({img,g:generation});drain();}}
 function drain(){while(active<2&&queue.length){const {img,g}=queue.shift();if(!current(img,g))continue;active++;request('galleryPreview',{id:img.dataset.id,hash:img.dataset.hash}).then(async d=>{if(!current(img,g))return;if(!d.available)throw Error('missing');if(d.hash!==img.dataset.hash||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d.src)||d.src.length>90000)throw Error('preview');img.src=d.src;await img.decode();if(!current(img,g))return;img.hidden=false;img.parentElement.querySelector('.preview-placeholder').hidden=true;}).catch(()=>{if(!current(img,g))return;img.removeAttribute('src');const placeholder=img.parentElement.querySelector('.preview-placeholder');placeholder.hidden=false;placeholder.textContent='預覽暫未載入';const button=img.closest('article').querySelector('.preview-retry');button.hidden=false;}).finally(()=>{active--;delete img.dataset.queued;drain();});}}
 function add(item){if(seen.has(item.id))return;seen.add(item.id);count++;const card=document.createElement('article');card.className='artwork-card';card.dataset.id=item.id;card.dataset.hash=item.hash;
  card.innerHTML=`<button type="button" class="artwork-open" aria-label="欣賞：${escape(item.title)}"><span class="artwork-preview"><span class="preview-placeholder">${item.hasPreview?'圖片載入中':'開啟欣賞作品'}</span>${item.hasPreview?`<img width="600" height="450" data-id="${escape(item.id)}" data-hash="${escape(item.hash)}" alt="${escape(item.title)}・作品縮圖" decoding="async">`:''}</span><span class="artwork-meta">${escape(item.term)} 學期・W${escape(item.week)}</span><h3>${escape(item.title)}</h3><span class="artwork-action">欣賞作品 →</span></button><button type="button" class="preview-retry" hidden>重試圖片</button>`;
  card.querySelector('.artwork-open').onclick=async()=>{const g=generation,btn=card.querySelector('.artwork-open');if(btn.disabled)return;btn.disabled=true;try{await open(item);}catch(e){if(current(card,g))status.textContent=e.message||'作品暫時無法開啟，請稍後重試。';}finally{if(current(card,g))btn.disabled=false;}};
  const img=card.querySelector('img');card.querySelector('.preview-retry').onclick=()=>{card.querySelector('.preview-retry').hidden=true;enqueue(img);};grid.append(card);if(img){if(observer)observer.observe(img);else enqueue(img);}
 }
 async function load(reset=false){if(disposed||(!reset&&busy))return;const g=reset?++generation:generation;if(reset){queue.length=0;observer?.disconnect();grid.replaceChildren();seen.clear();count=0;cursor=null;}busy=true;more.disabled=true;more.hidden=true;retry.hidden=true;status.textContent='正在載入作品……';
  try{const data=await request('galleryPage',{...filters,cursor:cursor||'',limit:12});if(disposed||g!==generation)return;if(!Array.isArray(data.items)||data.items.length>24)throw Error('作品清單格式不正確。');for(const item of data.items)add(item);cursor=data.nextCursor||null;status.textContent=count?`已顯示 ${count} 份作品${cursor?'，可繼續往下欣賞。':'，本展區已全部顯示。'}`:cursor?'這一批沒有符合的作品，請繼續載入。':'這個展區還沒有公開作品。';more.hidden=!cursor;
  }catch(e){if(disposed||g!==generation)return;status.textContent=count?'這一批暫時無法載入，已顯示的作品仍保留。':'作品暫時無法載入，請稍後重試。';retry.hidden=false;}
  finally{if(g===generation){busy=false;more.disabled=false;}}
 }
 async function checkVisible(){if(disposed||!root.isConnected||document.hidden)return;const g=generation,visible=[...grid.children].filter(c=>{const r=c.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;}).slice(0,24);if(!visible.length)return;
  try{const d=await request('galleryCheck',{ids:visible.map(c=>c.dataset.id)});if(g!==generation||disposed)return;for(const c of visible)if(!d.items.some(x=>x.id===c.dataset.id&&x.hash===c.dataset.hash)){c.querySelector('img')?.remove();c.querySelector('.artwork-open').disabled=true;c.querySelector('.artwork-preview').textContent='作品已更新或撤回';c.querySelector('.preview-retry').hidden=true;}}
  catch{if(g!==generation||disposed)return;for(const c of visible){const img=c.querySelector('img');if(img){img.removeAttribute('src');img.hidden=true;c.querySelector('.preview-placeholder').hidden=false;}}status.textContent='暫時無法確認展覽狀態，請重新整理。';}
 }
 form.onsubmit=e=>{e.preventDefault();filters={term:form.elements.term.value.trim(),week:form.elements.week.value};load(true);};more.onclick=()=>load();retry.onclick=()=>load();document.addEventListener('visibilitychange',checkVisible);const timer=setInterval(checkVisible,60000);load(true);
 return {reload:()=>load(true),destroy(){disposed=true;generation++;observer?.disconnect();queue.length=0;clearInterval(timer);document.removeEventListener('visibilitychange',checkVisible);}};
};
window.makeArtworkPreview=async function(project){
 const cv=document.createElement('canvas');cv.width=600;cv.height=450;const cx=cv.getContext('2d');cx.fillStyle='#f3f1e9';cx.fillRect(0,0,600,450);const f=project.frames[0];
 if(f?.src&&f.kind==='image'){const im=new Image();im.src=f.src;await im.decode();const scale=Math.min(600/im.width,450/im.height);cx.drawImage(im,(600-im.width*scale)/2,(450-im.height*scale)/2,im.width*scale,im.height*scale);}
 else{cx.fillStyle='#183b4c';cx.font='28px sans-serif';cx.textAlign='center';cx.fillText(f?.kind==='video'?'▶  影像作品':'文字開場',300,145);const text=f?.caption||'點開欣賞完整作品';cx.font='24px sans-serif';for(let i=0;i<4;i++)cx.fillText(text.slice(i*18,(i+1)*18),300,215+i*38);}
 for(const q of [.7,.55,.4,.25]){const src=cv.toDataURL('image/jpeg',q);if(src.length<=85000)return src;}
 throw Error('縮圖未能縮小，請重新選取副本媒體。');
};
})();
