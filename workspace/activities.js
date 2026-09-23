// Shared display contract. Server validates all inputs and owns permissions.
export const ACTIVITY = Object.freeze({
 'w3-rebuild':{week:3,title:'W3 ① 小組文字重建',group:true,maxVersions:2,description:'每組兩次生成結果，各附本版使用的完整描述。'},
 'w3-personal':{week:3,title:'W3 ② 個人短文作畫',group:false,maxVersions:1,description:'自己的短文與一張圖片，欣賞與交流。'},
 'w4':{week:4,title:'W4 個人圖卡',group:false,maxVersions:2,description:'個人圖卡 · 真人初讀 · 改或留'},
 'w5-workshop':{week:5,title:'W5 小組文字轉圖',group:true,maxVersions:8,description:'小組作品 · A、B 題各一張'},
 'w7':{week:7,title:'W7 同一事件，兩種呈現',group:false,maxVersions:2,description:'保存圖文 V1；有修改再存 V2，回報與改留理由留在歷程本。'},
 'w15-deck':{week:15,title:'W15–W16 公共說明作品',group:true,maxVersions:8,description:'五張投影片或一張完整 A3 五格照片，保留試讀、發表與修訂版本。'}
});
export const supportedKind = kind => !!ACTIVITY[kind];
export const isGroup = kind => ACTIVITY[kind]?.group===true;
export const canUpload = (a,w) => supportedKind(a.kind)&&!a.archived&&a.accepting&&w.versions.length<ACTIVITY[a.kind].maxVersions&&(a.kind!=='w4'||!w.versions.length||w.feedback.length&&['review','exhibit'].includes(a.phase));

export function activityTitle(a){
 const w3=['w3-rebuild','w3-personal'].includes(a.kind)?ACTIVITY[a.kind].title:null;
 return w3 ? ((a.testOnly||a.test_only||a.title?.includes('【測試】'))?'【測試】 ':'')+w3 : a.title;
}
