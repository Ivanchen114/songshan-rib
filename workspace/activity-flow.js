import {isGroup} from './activities.js';
const FLOWS={
 'w3-rebuild':['核對組員','看原圖、寫描述','保存並比較兩版'],
 'w3-personal':['寫自己的短文','上傳短文與圖片','欣賞與交流'],
 'w4':['上傳個人圖卡','完成獨立初讀','本人決定改或留'],
 'w5-personal':['選一題','上傳一張作品','欣賞同題、寫 ORID'],
 'w5-workshop':['核對組員','A、B 各選一題','保存兩張作品'],
 'w7-news':['核對組員、抽題','核對畫圖、同題交流','上傳圖卡與ORID紀錄'],
 'w7':['選動物園或手機材料','保存圖文作品','回讀與改留'],
 'w15-deck':['核對組員','選用途與作品形式','保存、試讀與修訂']
};
export function activityFlow(b){const steps=FLOWS[b.activity.kind];if(!steps||b.activity.archived)return '';const w=b.works[0],k=b.activity.kind;let current=['w5-personal','w7-news'].includes(k)?(!w?.topic?0:!w.versions.length?1:2):!w?0:!w.versions.length?(isGroup(k)?1:0):k==='w4'&&!w.decisions?.length?1:2;return '<ol class="activity-flow" aria-label="本週操作步驟">'+steps.map((label,i)=>`<li ${i===current?'aria-current="step"':''}><span>${i+1}</span><strong>${label}</strong>${i===current?'<small>目前這一步</small>':''}</li>`).join('')+'</ol>';}
