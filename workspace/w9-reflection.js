const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderW9({model,work,teacher,api}){
 let dirty=false,busy=false,requestId=crypto.randomUUID();const r=model.reflection,older=r&&r.versionId!==model.versionId;
 $('h1').textContent='回看今天，想想以後怎麼學';
 const prompts=[['o','O｜今天發生了什麼？','選今天課堂中的一件事，描述當時做了什麼、看到了什麼，或聽到了什麼。'],['r','R｜自己的感受','回想剛才描述的事，寫下自己的感受。沒有特別感受也可以。'],['id','I＋D｜對學習的啟發與應用','從這件事，我對自己的學習有什麼發現？選一個未來的科目或學習任務，說明想怎麼運用或調整今天學到的方法。']];
 $('#content').innerHTML='<p>三段圍繞同一件事，每段寫 1–3 句。</p><p class="reference-card">可以寫找資料、讀原文、同學交流、修改提案或使用 NotebookLM 的經驗。</p><form id="w9Orid">'+prompts.map(([k,l,h])=>'<label>'+l+'<p class="muted">'+h+'</p><textarea name="'+k+'" maxlength="800">'+esc(r?.answers[k]||'')+'</textarea></label>').join('')+'<p class="muted">草稿只有自己與老師可讀。送出後，老師開放課程展示時，同課班級可讀；這份反思不會進入對外展覽。</p>'+(teacher?'': '<div class="row"><button name="mode" value="draft" class="secondary">存草稿</button><button name="mode" value="submitted">送出反思</button></div>')+'</form>';
 const form=$('#w9Orid');
 $('#status').textContent=older?'這份 ORID 對應 V'+(work.versions.find(v=>v.id===r.versionId)?.ordinal||'？')+'；請核對目前照片。確認內容後保存，才會對應目前版本。':r?.status==='submitted'?'已送出 ORID，可回看或修改。':r?'草稿已保存，可繼續寫。':'上傳作品後，選今天課堂中的一件事，用三問回看自己的學習。';
 if(teacher){$('#back').textContent='← 回班級作品';$('#status').textContent=(older?'這份 ORID 對應先前作品版本。':'')+(r?.status==='submitted'?'學生已送出 ORID。':r?'學生尚在草稿階段。':'學生尚未寫 ORID。')+' 此處唯讀，保留學生原文。';}
 if(teacher||!model.editable){for(const el of form.elements)el.disabled=true;if(!teacher)$('#status').textContent='目前僅供查閱；老師開放交件與保存後可修改。';}
 form.addEventListener('input',()=>{dirty=true;requestId=crypto.randomUUID();});
 form.onsubmit=async e=>{e.preventDefault();if(busy||teacher||!model.editable)return;const v=new FormData(form),status=e.submitter.value,answers=Object.fromEntries(prompts.map(([k])=>[k,v.get(k).trim()]));if(status==='submitted'&&Object.values(answers).some(x=>!x)){$('#status').textContent='請完成三問；沒有特別感受也可以如實寫。';return;}busy=true;for(const el of form.elements)el.disabled=true;
 try{const saved=await api('saveReflection',{workId:model.workId,versionId:model.versionId,answers,status,allowPublic:false,expectedRevision:model.reflection?.revision||0,requestId},true);model.reflection={answers,status,versionId:model.versionId,revision:saved.revision};dirty=false;requestId=crypto.randomUUID();$('#status').textContent=status==='submitted'?'ORID 已送出，留在自己的作品旁。':'草稿已保存，回到這裡可以接著寫。';$('#status').className='saved';}catch(err){$('#status').textContent=err.message;}finally{busy=false;for(const el of form.elements)el.disabled=false;}};
 window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
}
