import {w4Progress} from './w4-progress.js';
import {isGroup} from './activities.js';
const FLOWS={
 'w3-rebuild':['核對組員','看原圖、寫描述','保存並比較兩版'],
 'w3-personal':['寫自己的短文','上傳短文與圖片','欣賞與交流'],
 'w4':['上傳個人圖卡','取得真人初讀回饋','自己決定修改或保留'],
 "w12-question":["先完成自己的思考與真實交流", "保存入口與指定紙本照片", "重新開啟核對清楚"],
 "w13-synthesis":["先完成自己的思考與真實交流", "保存入口與指定紙本照片", "重新開啟核對清楚"],
 "w14-expression":["先完成自己的思考與真實交流", "保存入口與指定紙本照片", "重新開啟核對清楚"],
 "w15-decision":["先完成自己的思考與真實交流", "保存入口與指定紙本照片", "重新開啟核對清楚"],
 "w16-response":["先完成自己的思考與真實交流", "保存入口與指定紙本照片", "重新開啟核對清楚"],
 'w10-priority':['紙本先排、查一句','保存依據與兩頁照片','重新開啟確認'],
 'w11-response':['讀原文、真實互看、本人回應','保存原文入口與三頁照片','重新開啟確認'],
 'w9-check':['自己查核、三人交流','保存資料、提案與思考紀錄','寫自己的學習 ORID'],
 'w5-personal':['選一題','上傳一張作品','欣賞同題、寫 ORID'],
 'w5-workshop':['核對組員','A、B 各選一題','保存兩張作品'],
 'w7-news':['核對組員、抽題','核對畫圖、同題交流','上傳圖卡與ORID紀錄'],
 'w7':['選動物園或手機材料','保存圖文作品','同學回饋與自己的決定'],
 'w15-personal-deck':['建立自己的作品','依序保存五頁與來源','試讀、個人發表後修訂或沿用'],
 'w15-deck':['核對組員','選用途與作品形式','保存、試讀與修訂']
};
export function activityFlow(b){const steps=FLOWS[b.activity.kind];if(!steps||b.activity.archived||['w4','w5-personal'].includes(b.activity.kind))return '';return '<ol class="activity-flow" aria-label="本週活動導覽">'+steps.map((label,i)=>`<li><span>${i+1}</span><strong>${label}</strong></li>`).join('')+'</ol>';}
