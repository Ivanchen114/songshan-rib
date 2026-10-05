import {conversationMarkup} from './conversation-source.js';
import {icon} from './visuals.js';
export function createNotificationsUI({state,api,esc,show,dialog,previewActive,openActivity,focusStudent,openReading,conversation}){
 let data=null,generation=0,opened=null,lastLoad=0;
 const button=()=>document.querySelector('#notificationsButton');
 const render=()=>{const b=button();if(!b)return;b.hidden=state.home?.person.role!=='student'||state.home.agreementRequired;if(b.hidden)return;b.innerHTML=`${icon('bell')}老師的訊息${data?.unread?` <span class="notification-badge">${data.unread}</span>`:''}`;b.setAttribute('aria-label',data?`老師的訊息，${data.unread} 項未讀`:'老師的訊息，尚未讀取');};
 async function refresh(){render();if(button()?.hidden)return;const v=++generation;try{const result=await api('notifications');if(v!==generation)return;data=result;lastLoad=Date.now();render();}catch{if(v===generation){data=null;render();button().textContent='老師的訊息 · 讀取未完成';}}}
 function list(){show(`<h2>老師的訊息</h2><p>數字表示尚未閱讀的對話或提醒；看過訊息不等於完成補件。</p>${previewActive?'<p class="notice">教師唯讀預覽，不會替學生標示已讀。</p>':''}${data?data.items.map(n=>`<article class="notification-item"><p><strong>${n.unread?'● 未讀 · ':''}W${n.week} · ${esc(n.title)}</strong><br><small>${esc(new Date(n.at).toLocaleString('zh-TW'))}</small></p><button class="secondary" data-action="notificationRead" data-id="${esc(n.id)}">閱讀這則訊息</button></article>`).join('')||'<p>目前沒有新的教師訊息。過去的回饋仍保留在原作品中。</p>':'<p role="alert">訊息尚未載入，不能判定沒有新訊息。</p>'}<button class="secondary" data-action="notifications">更新訊息列表</button>`);}
 async function action(el){const a=el.dataset.action;if(a==='notifications'){await refresh();list();return true;}if(a==='notificationRead'){
  const n=await api('notification',{id:el.dataset.id});opened=n;
  const context=n.conversation?`<details><summary>對照原初讀與完整對話</summary>${conversationMarkup(n.conversation,esc)}</details>`:'';
  show(`<h2>W${n.week} · ${esc(n.title)}</h2><section class="authored source-teacher"><strong class="source-label">老師${n.kind==='reminder'?'的提醒':'的回覆'}</strong><p class="work-text">${esc(n.body)}</p></section>${context}<p id="notificationReadStatus" role="status">${previewActive?'唯讀預覽，未變更學生的未讀狀態。':'正在同步已讀狀態……'}</p><div class="row"><button data-action="notificationTarget">回原作品與回饋 →</button><button class="secondary" data-action="notifications">回訊息列表</button></div><p class="muted">已讀僅表示開啟內容；應完成的改留或補件仍依原紀錄判定。</p>`);
  if(!previewActive){try{await api('readNotification',{id:n.id,version:n.version},true);document.querySelector('#notificationReadStatus').textContent='已讀';await refresh();}catch(e){document.querySelector('#notificationReadStatus').textContent='已讀尚未同步：'+e.message;}}return true;
 }if(a==='notificationTarget'&&opened){const n=opened;dialog.close();await openActivity(n.activityId);if(n.kind==='conversation')await conversation(n.target.reviewId);else if(n.kind==='record')await openReading(n.target.readingId);else await focusStudent(null,n.kind==='reading'?'human':n.kind==='assessment'?'assessment':'image',n.target.workId);return true;}return false;}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastLoad>30000)void refresh();});
 window.addEventListener('focus',()=>{if(Date.now()-lastLoad>30000)void refresh();});
 const timer=setInterval(()=>{if(!document.hidden&&state.home?.person.role==='student')void refresh();},60000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return {refresh,action,reset(){++generation;data=null;opened=null;const b=button();if(b)b.hidden=true;}};
}
