export function saveFeedback(form){
 const top=document.querySelector('#status');
 const box=document.createElement('section');box.className='save-feedback';box.hidden=true;box.tabIndex=-1;
 box.innerHTML='<p role="status" aria-live="polite" aria-atomic="true"></p><a class="button secondary" hidden>回我的作品，查看紀錄 →</a>';
 form.append(box);const message=box.querySelector('p'),back=box.querySelector('a');
 function set(text,state='info',focus=false){
  box.hidden=false;box.dataset.state=state;message.textContent=text;
  if(top){top.textContent=text;top.className=state==='success'?'saved':'';}
  back.hidden=state!=='success';back.href=document.querySelector('#back')?.href||'/workspace/';
  if(focus){box.focus({preventScroll:true});box.scrollIntoView({block:'nearest',behavior:'auto'});}
 }
 return {set,pending(){form.setAttribute('aria-busy','true');set('正在保存，請稍候……','pending',true);},done(text){form.removeAttribute('aria-busy');set(text,'success',true);},error(text){form.removeAttribute('aria-busy');set(text,'error',true);}};
}
