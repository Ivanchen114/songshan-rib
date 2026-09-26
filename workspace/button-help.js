// Short descriptions for the teacher's existing controls; displaying help never calls an API.
const ACTION_HELP={
 home:'回到課堂活動清單，選擇其他週次。',activity:'開啟這個活動的班級作品與進度；不會切換課堂階段。',refresh:'重新讀取最新作品與回饋；不重抽、不重送。',
 control:'設定活動階段與是否開放保存。會影響同活動的各班，不只目前查看的班級。',
 dispatch:'安排初讀或補齊缺額；保留已完成及進行中的配對。先核對參與名單，再確認。',
 reminderPlan:'提醒目前未上傳 W4 圖片的人。先預覽名單及期限，再發送站內提醒；補交後自動解除。',
 sendReminders:'將這份提醒發給預覽名單中的學生。相同內容不重複發；不會自動扣分。',
 teacherReading:'老師先看圖，可貼入 AI 草稿並修改。親自確認後才發布老師初讀；學生仍須自己決定修改或保留。',
 rotateReading:'將眼前圖片旋轉 90°，方便閱讀；不會改動學生上傳的原圖。',
 replace:'這個讀者任務卡住時，重新安排讀者；先查看原因與配對紀錄。',assign:'替這件缺少讀者的作品安排補位；先核對可安排的同學。',
 view:'開啟這一版作品，查看當時的圖片與文字；不會更改內容。',assessmentMedia:'在評閱視窗打開這一版作品，核對證據。',
 assess:'合看 W4–W5 本人證據，保存評分草稿、待補說明或正式評閱；不會因流程完成自動給分。',
 conversation:'查看原初讀與後續對話，可接著澄清理解；原本的回饋會保留。',
 publication:'檢查匿名公開內容或撤下展示。撤下仍保留課堂作品，不等於刪除或扣分。',
 demoPlan:'發 W5 示範給未交 W4 圖卡者，讓他先練判讀；示範不能代替自己的 W4 作品。先預覽再發。',
 assignDemos:'確認分派畫面中的示範練習；不建立學生自己的 W4 作品版本。',
 aiReading:'查看這位學生對照的圖卡、甲乙留言與可見判讀紀錄；這裡不是正式評分。',
 original:'查看本活動已設定的教師原圖，先核對是否與本次課堂材料一致。',
 reference:'更換本次 W3 活動使用的教師原圖；不會重做學生已交的作品。',
 revealAuthors:'全班投完才按。公布作者的同時會停止投票；先確認課堂進度。',
 selectionReview:'檢查這個選件的匿名展示條件與個資；不會繞過作者的不公開設定。',
 selectionFeature:'調整期末精選名單；取消精選仍保留原作品。',selections:'查看自願選錄的既有作品。零至三件，不列缺交、不另計分。',
 journey:'從一位學生查看整學期作品、回饋與本人決定，可整理私人作品集。',journeyStudent:'查看這位學生的學期作品與歷程。',journeyPreview:'核對選中的版本，再整理可離線保存的私人作品集。',
 studentAccounts:'核對帳號、處理忘記六碼或追加學生；一般上課不用重新設定。',
 profileEdit:'修改學生姓名、班級或座號前，先核對名單與本人身分。',rosterAdd:'預覽新增學生名單，再匯入；不要為了追加一人重建整個學期。',
 accountReset:'重新產生這位學生的登入六碼，原碼將失效；確認後交給本人保管。',
 accountActive:'切換帳號是否可登入；停用仍保留既有作品與歷程。',accountCodeDownload:'下載本次產生的登入碼，請由老師妥善保管。',
 termManager:'每學期準備名單、教師與活動，核對後備份並啟用；不是每週都要操作。',
 termEdit:'準備或編輯新學期草稿，尚未切換目前學生入口。',termSummary:'核對新學期的名單、教師、沿用帳號與活動摘要。',termCodes:'下載本次產生的新生登入碼，請妥善保管。',termBackup:'下載切換學期前的私有備份，僅供管理教師保管。',
 maintenance:'查看資料快照狀態；一般授課不需操作。',backupRun:'立即建立並核對資料庫快照；這份快照不包含圖片本體。',archive:'查閱舊系統搬遷保留的原始資料，平常上課不用操作。',archiveTable:'查看這類舊資料的原始紀錄；不修改作品。',
 clearFilters:'清除搜尋與狀態篩選，重新顯示全班作品。',testFeedback:'只在隔離測試活動提供示範回饋；不代表真實學生的獨立初讀。'
};
const FORM_HELP={
 reminderPreview:'重新查目前未交名單，先看訊息和對象；此步尚未發送。',
 dispatch:'按目前核對的參與名單安排讀者，保留已完成與進行中的配對。',
 control:'套用課堂階段與保存開關，會影響同活動的各班。',
 assess:'保存你選擇的評閱狀態與依據；正式評閱前須親自核對本人證據。',
 reply:'把這段回覆加入對話；原本的初讀文字會保留。',
 referenceUpload:'將所選圖片保存為本次活動的教師原圖。',
 journeyExport:'製作私人離線作品集，不會自動公開。',
 termSave:'保存新學期草稿，供核對名單與設定；還不會切換學期。',
 termActivate:'依核對結果備份並啟用新學期；舊活動會封存，請確認正確學期。'
};
export function buttonDescription(el){
 const action=el.dataset?.action;if(ACTION_HELP[action])return ACTION_HELP[action];
 if(el.id==='logout')return '登出這台裝置的作品區；已保存內容仍保留。';
 if(el.id==='closeDialog')return '關閉目前視窗；未保存的內容會先詢問是否放棄。';
 if(el.id==='classChoice')return '只切換你查看的班級，不改課堂設定或學生紀錄。';
 if(el.id==='workFilter')return '依狀態篩選作品清單，不會更改學生的交件或回饋。';
 if(el.id==='termView')return '切換查閱學期，不會啟用新學期或改變學生入口。';
 const form=el.form?.id;
 if(form==='teacherReading')return el.value==='published'?'發布這份回饋給學生。老師初讀須親自看圖確認；AI 模擬會如實標示，不能當真人初讀。':'只保存老師補讀草稿，學生尚看不到。';
 if(form==='publication'||form==='selectionPublish')return el.value==='no'?'撤下對外展示，課堂版本與歷程仍保留。':'確認內容與公開條件後公開這個版本，尊重作者的不公開設定。';
 if(FORM_HELP[form])return FORM_HELP[form];
 const label=el.textContent?.replace(/\s+/g,' ').trim()||'';
 if(el.tagName==='SUMMARY'){if(el.parentElement?.classList.contains('work-summary'))return '展開這件作品，查看版本、回饋、本人決定及教師操作。';if(label.includes('尚未交件名單'))return '展開目前未交的學生名單；這裡只查閱，不會自動發出提醒。';if(label.includes('追蹤讀者任務'))return '查看等候、進行中或申請協助的初讀任務，需要時再安排補位。';if(/號.*(尚未保存|草稿|已送出|圖卡提醒)/.test(label))return '展開這位學生的 AI 留言判讀狀態與本人作答紀錄。';}
 if(label.includes('進入課程展廳'))return '開啟登入後的課堂作品展廳；與對外匿名展廳不同。';
 if(label.includes('查看 ORID'))return '查看學生引用同題作品後的反思，並檢查可供匿名展示的副本。';
 if(label.includes('查看個人提案交件'))return '切換到 W8 每人上傳 p.2 的入口；小組抽題不等於個人已交件。';
 if(label.includes('每週操作速查'))return '按週次查操作順序，也可搜尋按鈕名稱或用途。';
 if(label.includes('系統導覽與期末示範'))return '查看模擬操作案例，不會寫入學生紀錄。';
 return '';
}
export function installButtonHelp({enabled=()=>true}={}){
 const tip=document.createElement('div');tip.id='teacherButtonHelp';tip.className='button-help-tooltip';tip.setAttribute('role','tooltip');tip.setAttribute('popover','manual');tip.hidden=true;document.body.append(tip);
 let target=null,timer=null,hideTimer=null;
 function hide(){clearTimeout(timer);clearTimeout(hideTimer);if(target){const ids=(target.getAttribute('aria-describedby')||'').split(/\s+/).filter(x=>x&&x!==tip.id);if(ids.length)target.setAttribute('aria-describedby',ids.join(' '));else target.removeAttribute('aria-describedby');}target=null;if(tip.hidePopover&&tip.matches(':popover-open'))tip.hidePopover();tip.hidden=true;}
 function show(el){if(!enabled()||!el.isConnected)return;const body=buttonDescription(el);if(!body)return;hide();target=el;tip.textContent=body;tip.hidden=false;if(tip.showPopover)tip.showPopover();const ids=(el.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);el.setAttribute('aria-describedby',[...new Set([...ids,tip.id])].join(' '));const r=el.getBoundingClientRect(),box=tip.getBoundingClientRect();tip.style.left=Math.max(10,Math.min(r.left,innerWidth-box.width-10))+'px';tip.style.top=(r.bottom+box.height+12<innerHeight?r.bottom+8:Math.max(10,r.top-box.height-8))+'px';}
 const eligible=e=>e.target instanceof Element?e.target.closest('button,a.button,select,summary'):null;
 document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=eligible(e);if(!el||el.contains(e.relatedTarget))return;clearTimeout(hideTimer);clearTimeout(timer);if(el!==target)hide();timer=setTimeout(()=>show(el),350);});
 document.addEventListener('pointerout',e=>{const el=eligible(e);if(!el||el.contains(e.relatedTarget)||tip.contains(e.relatedTarget))return;clearTimeout(timer);hideTimer=setTimeout(hide,150);});
 tip.addEventListener('pointerenter',()=>clearTimeout(hideTimer));tip.addEventListener('pointerleave',()=>{if(document.activeElement!==target)hide();});
 document.addEventListener('focusin',e=>{const el=eligible(e);if(el)show(el);else hide();});
 document.addEventListener('focusout',hide);document.addEventListener('click',hide);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!tip.hidden){hide();e.preventDefault();e.stopPropagation();}},true);
 window.addEventListener('resize',hide);document.addEventListener('scroll',hide,true);
 // Views are replaced during refresh; discard descriptions of removed controls.
 new MutationObserver(()=>{if(target&&!target.isConnected)hide();}).observe(document.querySelector('#app'),{childList:true,subtree:true});
}
