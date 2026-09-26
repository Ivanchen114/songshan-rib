// Shared display contract. Server validates all inputs and owns permissions.
export const ACTIVITY = Object.freeze({
 'w3-rebuild':{week:3,title:'W3 ① 小組文字重建',group:true,maxVersions:2,description:'每組兩次生成結果，各附本版使用的完整描述。'},
 'w3-personal':{week:3,title:'W3 ② 個人短文作畫',group:false,maxVersions:1,description:'自己的短文與一張圖片，欣賞與交流。'},
 'w4':{week:4,title:'W4 個人圖卡',group:false,maxVersions:2,description:'個人圖卡 · 同學回饋 · 修改或保留'},
 'w5-personal':{week:5,title:'W5 個人文字轉圖',group:false,maxVersions:8,description:'個人作品 · 選一題，每人交一張圖'},
 'w5-workshop':{week:5,title:'W5 小組文字轉圖',group:true,maxVersions:8,description:'小組作品 · A、B 題各一張'},
 'w7-news':{week:7,title:'W7 新聞 × 研究',group:true,maxVersions:2,description:'本組抽一份新聞與研究；同題交流後，一次保存最後圖卡與一則ORID交流紀錄。'},
 'w8-materials':{week:8,title:'W8 共讀材料 · 個人提案',group:true,maxVersions:0,description:'核對組員、均衡抽題；先自己讀寫，再組內分享，每人完成紙本提案。'},
 'w8-proposal':{week:8,title:'W8 我的提案 · 個人交件',group:false,maxVersions:8,description:'每人上傳交流後的 p.2 提案書；照片保留真實問句、修訂或保留的理由。'},
 'w7':{week:7,title:'W7 同一事件，兩種呈現',group:false,maxVersions:2,description:'保存圖文 V1；有修改再存 V2，同學的回饋與自己修改或保留的理由留在歷程本。'},
 'w15-deck':{week:15,title:'W15–W16 公共說明作品',group:true,maxVersions:8,description:'五張投影片或一張完整 A3 五格照片，保留試讀、發表與修訂版本。'}
});
export const supportedKind = kind => !!ACTIVITY[kind];
export const isGroup = kind => ACTIVITY[kind]?.group===true;
export const canUpload = (a,w) => supportedKind(a.kind)&&!a.archived&&a.accepting&&w.versions.length<ACTIVITY[a.kind].maxVersions&&(a.kind!=='w4'||!w.versions.length||(w.hasHumanFeedback??w.feedback.length)&&['review','exhibit'].includes(a.phase));

export function activityTitle(a){
 const w3=['w3-rebuild','w3-personal','w5-personal','w7-news','w8-materials','w8-proposal'].includes(a.kind)?ACTIVITY[a.kind].title:null;
 return w3 ? ((a.testOnly||a.test_only||a.title?.includes('【測試】'))?'【測試】 ':'')+w3 : a.title;
}
