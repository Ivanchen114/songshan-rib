import {previewFetch} from './student-preview.js';
const params=new URLSearchParams(location.search),$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model,board,dirty=false,busy=false,requestId=crypto.randomUUID(),teacher=false;
async function api(action,args={},write=false){const r=await previewFetch('/api/workspace'+(write?'':'?'+new URLSearchParams({action,...args})),{method:write?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:write?{'Content-Type':'application/json'}:{},...(write?{body:JSON.stringify({action,...args})}:{})}),p=await r.json();if(!p.ok)throw Error(p.error||'暫時無法讀取。');return p.data;}
function fields(a={}){return [['o','O｜我看到什麼具體做法？','例如：他用兩條不同顏色的線，區分兩種路線。'],['r','R｜我有什麼反應或感受？','驚訝、疑惑、覺得清楚，或沒有特別感受，都可以。'],['id','I＋D｜我學到什麼，想怎麼用？','這個畫法讓我理解什麼？自己的圖想保留或調整什麼，為什麼？']].map(([key,title,hint])=>`<label>${title}<textarea name="${key}" maxlength="800" placeholder="${esc(hint)}">${esc(a[key]||'')}</textarea></label>`).join('');}
async function start(){try{
 const home=await api('home');teacher=home.person.role!=='student';
 if(home.agreementRequired)throw Error('請先回作品區完成登入說明，再開啟反思。');
 const activityId=params.get('activity');$('#back').href='/workspace/?'+new URLSearchParams({activity:activityId,...(params.get('className')?{className:params.get('className')}:{})});
 board=await api('board',{activityId,...(teacher?{className:params.get('className')}:{})});
 const work=board.works.find(w=>w.id===params.get('work'))||(!teacher?board.works[0]:null);
 if(!work||!work.versions.length)throw Error('先回自己的作品上傳一張圖，再欣賞同題作品。');
 model=await api('reflection',{workId:work.id,...(params.get('reference')?{referenceVersionId:params.get('reference')}:{})});
 const r=model.reflection,ref=model.reference,older=!!r&&r.versionId!==model.versionId;
 const gallery='/workspace/class-gallery.html?'+new URLSearchParams({activity:activityId,topic:work.topic});
 $('#content').innerHTML=`<section class="reference-card"><h2>這次欣賞與回應的同題作品</h2>${ref?`<p>${esc(ref.label)}${ref.ordinal?' · V'+ref.ordinal:''}</p><div id="referenceImage"></div>`:'<p>選一件同學的同題圖，再按「選這件作品，寫 ORID」。系統會連結作者與版本，讓你的回應有明確對象。</p>'}<a href="${esc(gallery)}">${ref?'回同題展廳／更換作品':'去欣賞同題作品'} →</a></section><p>寫在自己的作品旁，不需另寫紙本，也不需手打同學姓名。</p>${teacher?'<h2>對外展覽文字</h2><p>下方先帶入學生原文。檢查並將文字中的姓名改為「參考作品 A」；此處只保存匿名展示副本，不改學生原始紀錄。</p>':''}<form id="reflectionForm">${fields(r?.answers)}${teacher?'<label class="check-row"><input type="checkbox" name="reviewed" required>已核對反思文字，可匿名展示。</label>':`<label class="check-row"><input type="checkbox" name="allowPublic" ${r?.allowPublic?'checked':''}>這份反思也可隨作品匿名展覽（經老師檢查後）。</label><p class="muted">草稿只有自己與老師可讀；送出後，共同上課的同學可讀。取消勾選並保存，或作品選「不公開」，對外就不顯示反思。</p>`}<div class="row">${teacher?'<button name="mode" value="review">保存匿名展示副本</button>':'<button name="mode" value="draft" class="secondary">存草稿</button><button name="mode" value="submitted">送出反思</button>'}</div></form>`;
 if(teacher&&(!r?.allowPublic||r?.status!=='submitted')){for(const b of document.querySelectorAll('form button'))b.disabled=true;$('#status').textContent='學生尚未送出反思，或尚未同意隨作品公開。';}
 else{$('#status').textContent=r?(r.status==='submitted'?'已送出反思；可繼續修改。':'已保存草稿，可接著寫。'):'欣賞同題 → 選回應對象 → 寫自己的 ORID。';}
 if(older){$('#status').textContent='原 ORID 對應 V'+(work.versions.find(v=>v.id===r.versionId)?.ordinal||'？')+'，原文已保留。'+(teacher?'請等學生核對目前版本後，再檢查匿名副本。':'請核對新圖；要沿用到目前版本，可確認文字後保存。');if(teacher)for(const b of document.querySelectorAll('form button'))b.disabled=true;}
 if(!teacher&&r&&params.get('reference')&&params.get('reference')!==r.referenceVersionId){dirty=true;$('#status').textContent='已換一件回應對象，請核對三問後保存。';}
 if(!teacher&&!model.editable){for(const e of document.querySelectorAll('form input,form textarea,form button'))e.disabled=true;$('#status').textContent='目前僅供查閱，老師開放展廳與保存後可修改。';}
 if(!teacher&&(!ref||ref.unavailable)){for(const b of document.querySelectorAll('form button'))b.disabled=true;}
 if(ref?.versionId){try{const media=await api('media',{versionId:ref.versionId,size:'thumb'});for(const m of media.images){const img=new Image();img.src=m.url;img.alt='引用的作品 V'+ref.ordinal;img.className='reference-preview';$('#referenceImage').append(img);}}catch{}}
 $('#reflectionForm').addEventListener('input',()=>{dirty=true;requestId=crypto.randomUUID();});
 $('#reflectionForm').onsubmit=save;
}catch(e){$('#status').textContent=e.message;}}
async function save(e){e.preventDefault();if(busy)return;const form=e.target,values=new FormData(form),answers=Object.fromEntries(['o','r','id'].map(k=>[k,values.get(k)])),mode=e.submitter.value;
 if(mode!=='draft'&&Object.values(answers).some(x=>!x.trim())){$('#status').textContent='請完成三問；沒有特別感受也可以如實寫。';return;}
 busy=true;for(const b of form.querySelectorAll('button,input,textarea'))b.disabled=true;$('#status').textContent='正在保存……';
 try{const result=await api(teacher?'reviewReflection':'saveReflection',{workId:model.workId,answers,expectedRevision:model.reflection?.revision||0,...(teacher?{reviewed:values.has('reviewed')}:{status:mode,versionId:model.versionId,referenceVersionId:model.reference.versionId,allowPublic:values.has('allowPublic'),requestId})},true);
 if(!teacher)model.reflection={answers,status:mode,versionId:model.versionId,referenceVersionId:model.reference.versionId,allowPublic:values.has('allowPublic'),revision:result.revision};dirty=false;requestId=crypto.randomUUID();$('#status').textContent=teacher?'匿名展示副本已保存；作品公開時才會一起顯示。':mode==='draft'?'草稿已保存，稍後可回自己的作品繼續。':'反思已送出，已留在自己的作品旁。';$('#status').className='saved';
 }catch(err){$('#status').textContent=err.message;}finally{busy=false;for(const b of form.querySelectorAll('button,input,textarea'))b.disabled=false;}}
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
await start();
