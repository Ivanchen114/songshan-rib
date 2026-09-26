// The teacher session stays unchanged. Preview context is carried by this tab's URL.
const params=new URLSearchParams(location.search);
export const previewActive=params.has('previewStudent')||params.has('previewActivity');
const context={previewStudent:params.get('previewStudent')||'',previewActivity:params.get('previewActivity')||'',...(params.get('previewWeek')==='18'?{previewWeek:'18'}:{})};
const message='學生視角只供查看，不能代替學生保存或送出。';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages=new Set(['/workspace/','/workspace/index.html','/workspace/class-gallery.html','/workspace/reflection.html']);
export function previewUrl(href){
  const url=new URL(href,location.href);
  if(previewActive&&url.origin===location.origin&&pages.has(url.pathname))for(const [k,v] of Object.entries(context))url.searchParams.set(k,v);
  return url.pathname+url.search+url.hash;
}
export async function previewFetch(href,options={}){
  if(!previewActive)return fetch(href,options);
  if((options.method||'GET')!=='GET')throw Error(message);
  await ready;
  const url=new URL(href,location.href);
  for(const [k,v] of Object.entries(context))url.searchParams.set(k,v);
  return fetch(url,options);
}
function entryUrl(activityId,studentId,week){return '/workspace/?'+new URLSearchParams({...(week==='18'?{week}:{activity:activityId}),previewActivity:activityId,previewStudent:studentId,...(week?{previewWeek:week}:{})});}
function picker(students,activityId,week=''){
  return `<section class="panel preview-picker"><h2>查看學生視角</h2><p class="muted">選擇學生，查看他目前看得到的作品台；只供查看。</p><div class="row"><label>選擇學生<select id="previewStudentChoice" data-activity="${esc(activityId)}" data-week="${esc(week)}" ${students.length?'':'disabled'}>${students.map(s=>`<option value="${esc(s.student_id)}">${s.className?esc(s.className)+' 班 ':''}${esc(s.seat)} 號 · ${esc(s.name)}</option>`).join('')||'<option>沒有可查看的學生</option>'}</select></label>${students.length?`<a class="button" id="previewEnter" href="${esc(entryUrl(activityId,students[0].student_id,week))}">查看這位學生的畫面</a>`:''}</div></section>`;
}
export function previewPicker(state){
  if(state.board.activity.archived)return '';
  return picker(state.roster.filter(s=>s.active&&!!s.is_test===!!state.board.activity.testOnly).map(s=>({...s,className:state.className})),state.activity);
}
export async function selectionPreviewPicker(state,api){
  const anchor=state.home.activities.find(a=>a.term===(state.termView||state.home.currentTerm)&&!a.archived&&!!a.test_only===!!state.selectionTest);
  if(!anchor)return '';
  const {classes}=await api('classes',{activityId:anchor.id});
  const rows=await Promise.all(classes.map(async className=>{const {students}=await api('roster',{activityId:anchor.id,className});return students.filter(s=>s.active&&!!s.is_test===!!state.selectionTest).map(s=>({...s,className}));}));
  return picker(rows.flat(),anchor.id,'18');
}
document.addEventListener('change',e=>{if(e.target.id==='previewStudentChoice'){const s=e.target;document.querySelector('#previewEnter').href=entryUrl(s.dataset.activity,s.value,s.dataset.week);}});
const directWrites=new Set(['ensureWork','w8StartUpload','workPrivacy','invitation','drawTopic','drawW8Topic','drawW7Topic','markCurrent','paperKeep','wallVote','vote','logout']);
function protectPreview(){
  for(const el of document.querySelectorAll('form input,form textarea,form select,form button:not([type="button"]),#logout')){
    if(!el.disabled)el.disabled=true;
    if(el.id==='logout'&&!el.hidden)el.hidden=true;
  }
  for(const el of document.querySelectorAll('[data-action]'))if(directWrites.has(el.dataset.action)&&!el.disabled){el.disabled=true;el.title=message;}
  for(const a of document.querySelectorAll('a[href]')){
    if(a.closest('#studentPreviewBanner'))continue;
    const url=new URL(a.href,location.href);
    if(url.origin===location.origin&&pages.has(url.pathname)){
      const next=previewUrl(a.href);if(a.getAttribute('href')!==next)a.setAttribute('href',next);
    }
  }
}
async function setup(){
  if(!previewActive)return;
  const style=document.createElement('link');style.rel='stylesheet';style.href='/workspace/student-preview.css';document.head.append(style);
  const banner=document.createElement('aside');banner.id='studentPreviewBanner';banner.setAttribute('aria-label','教師查看學生視角');
  document.body.prepend(banner);
  const teacherUrl='/workspace/?'+new URLSearchParams(context.previewWeek?{week:context.previewWeek}:{activity:context.previewActivity});
  banner.innerHTML=`<strong>學生視角 · 唯讀</strong><p role="status">正在核對查看權限……</p><a href="${esc(teacherUrl)}">返回教師畫面</a>`;
  document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
  new MutationObserver(protectPreview).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href','disabled','hidden']});
  protectPreview();
  try{
    const response=await fetch('/api/workspace?'+new URLSearchParams({action:'previewContext',...context}),{credentials:'same-origin',cache:'no-store'});
    const payload=await response.json();if(!payload.ok)throw Error(payload.error||'無法開啟學生視角。');
    const c=payload.data,index=c.students.findIndex(s=>s.student_id===c.studentId),student=c.students[index];
    if(!student)throw Error('此學生目前不在有效名單中。');
    const target=i=>entryUrl(c.activityId,c.students[i].student_id,context.previewWeek);
    banner.innerHTML=`<div><strong>學生視角 · 唯讀</strong><p>${esc(c.className)} 班 ${esc(student.seat)} 號 · ${esc(student.name)}</p><small>教師預覽已略過登入同意頁，方便查看本週內容；不會替學生同意，也不能保存或送出。</small></div><div class="preview-controls"><label for="previewSwitch">切換學生</label><select id="previewSwitch">${c.students.map((s,i)=>`<option value="${i}" ${i===index?'selected':''}>${esc(s.seat)} 號 · ${esc(s.name)}</option>`).join('')}</select><div>${index>0?`<a href="${esc(target(index-1))}">← 上一位</a>`:''}${index<c.students.length-1?`<a href="${esc(target(index+1))}">下一位 →</a>`:''}<a class="preview-exit" href="${esc(teacherUrl+'&className='+encodeURIComponent(c.className))}">返回教師畫面</a></div></div>`;
    banner.querySelector('select').addEventListener('change',e=>location.assign(target(Number(e.target.value))));
  }catch(error){banner.querySelector('[role="status"]').textContent=error.message;throw error;}
}
// Keep failures handled even if a page has not made its first API request yet.
const ready=setup();ready.catch(()=>{});
