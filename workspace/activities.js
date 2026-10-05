// Shared display contract. Server validates all inputs and owns permissions.
export const LATE_KINDS=['w14-public-proposal','w15-argument-poster'];
export const isLate=kind=>LATE_KINDS.includes(kind);
export const ACTIVITY = Object.freeze({
 'w14-public-proposal':{week:14,title:'W14 公共提案收件版',group:true,maxMembers:3,maxVersions:8,description:'每組一份；W14 封存內容，W15 只補投遞證據。證據只供教師查看。'},
 'w15-argument-poster':{week:15,title:'W15–W16 議題論證 A1 海報',group:true,maxMembers:3,maxVersions:8,description:'每組一份；分別保留 W15 送印版與 W16 定稿。教師開放後才進班內展示。'},
 'w15-personal-deck':{week:15,title:'W15–W16 五頁照片備援／舊作品',group:false,maxVersions:8,description:'Canva學生改在W15／W16個人紀錄貼連結；此處保留紙本五頁照片備援及舊作品。'},
"w12-question":{"week": 12, "title": "W12 問題修訂與檔案索引", "group": false, "maxVersions": 8, "description": "形成可回答的自選問題，依真人回饋完成自己的修訂或保留理由。 線上留來源與入口，紙本判斷附照片。"},
"w13-synthesis":{"week": 13, "title": "W13 資料整合與本人判斷", "group": false, "maxVersions": 8, "description": "比較多份資料的對象、時間、量法與來源關係，整合成有界線的判斷。 線上留來源與入口，紙本判斷附照片。"},
"w14-expression":{"week": 14, "title": "W14 表達選擇與真人試讀", "group": false, "maxVersions": 8, "description": "做報告最關鍵的一頁：本人先做、比較候選、真人說回後自行決定。 線上留來源與入口，紙本判斷附照片。"},
"w15-decision":{"week": 15, "title": "W15 個人安排與試讀決定", "group": false, "maxVersions": 8, "description": "指出本人安排；兩人互讀，各記收到與給出的真實回饋，按誤解後果選優先修改處，再看新讀者理解。 線上留來源與入口，紙本判斷附照片。"},
"w16-response":{"week": 16, "title": "W16 個人回應與證據索引", "group": false, "maxVersions": 8, "description": "引用實問卡，每人先答、回原文補答，再決定修改或保留。 線上留來源與入口，紙本判斷附照片。"},

 'w3-rebuild':{week:3,title:'W3 ① 小組文字重建',group:true,maxVersions:2,description:'每組兩次生成結果，各附本版使用的完整描述。'},
 'w3-personal':{week:3,title:'W3 ② 個人短文作畫',group:false,maxVersions:1,description:'自己的短文與一張圖片，欣賞與交流。'},
 'w4':{week:4,title:'W4 個人圖卡',group:false,maxVersions:2,description:'個人圖卡 · 同學回饋 · 修改或保留'},
 'w5-personal':{week:5,title:'W5 個人文字轉圖',group:false,maxVersions:8,description:'個人作品 · 選一題，每人交一張圖'},
 'w5-workshop':{week:5,title:'W5 小組文字轉圖',group:true,maxVersions:8,description:'小組作品 · A、B 題各一張'},
 'w7-news':{week:7,title:'W7 新聞 × 研究',group:true,maxVersions:2,description:'本組抽一份新聞與研究；同題交流後，一次保存最後圖卡與一則ORID交流紀錄。'},
 'w8-materials':{week:8,title:'W8 共讀材料 · 個人提案',group:true,maxVersions:0,description:'核對組員、均衡抽題；先自己讀寫，再組內分享，每人完成紙本提案。'},
 'w10-priority':{week:10,title:'W10 排序與查核依據',group:false,maxVersions:8,description:'原句、來源與搜尋路徑留在線上，附 p.1–2 的排序與本人判斷照片。'},
 'w11-response':{week:11,title:'W11 理解與回應',group:false,maxVersions:8,description:'附 p.1–3 的初次理解、真實回饋、本人回應與比較問題；線上只留原文入口。'},
 'w9-check':{week:9,title:'W9 查核後提案 · 學習反思',group:false,maxVersions:8,description:'保存資料依據、查核後提案與 p.1 思考紀錄照片，再寫自己的 ORID。'},
 'w8-proposal':{week:8,title:'W8 我的提案 · 個人交件',group:false,maxVersions:8,description:'每人上傳交流後的 p.2 提案書；照片保留真實問句、修訂或保留的理由。'},
 'w7':{week:7,title:'W7 同一事件，兩種呈現',group:false,maxVersions:2,description:'保存圖文 V1；有修改再存 V2，同學的回饋與自己修改或保留的理由留在歷程本。'},
 'w15-deck':{week:15,title:'W15–W16 舊制小組作品',group:true,maxVersions:8,description:'保留舊制共同作者、作品與版本；現行課程請進「五頁照片備援／舊作品」。'}
});
export const supportedKind = kind => !!ACTIVITY[kind];
export const isGroup = kind => ACTIVITY[kind]?.group===true;
export const canUpload = (a,w) => supportedKind(a.kind)&&(!isLate(a.kind)||w.checkpoint?.canContent===true)&&!a.archived&&a.accepting&&w.versions.length<ACTIVITY[a.kind].maxVersions&&(a.kind!=='w4'||!w.versions.length||(w.hasHumanFeedback??w.feedback.length)&&['review','exhibit'].includes(a.phase));

export function activityTitle(a){
 const w3=[...LATE_KINDS,'w3-rebuild','w3-personal','w5-personal','w7-news','w8-materials','w8-proposal','w9-check','w10-priority','w11-response',"w12-question","w13-synthesis","w14-expression","w15-decision","w16-response","w15-personal-deck","w15-deck"].includes(a.kind)?ACTIVITY[a.kind].title:null;
 return w3 ? ((a.testOnly||a.test_only||a.title?.includes('【測試】'))?'【測試】 ':'')+w3 : a.title;
}
