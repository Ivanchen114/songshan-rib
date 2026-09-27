// W10 and W11: online evidence supplements the learner's handwritten judgment.
export const READING_KINDS=["w10-priority", "w11-response", "w12-question", "w13-synthesis", "w14-expression", "w15-decision", "w16-response"];
export const READING_FIELDS={
"w12-question":[["sourceNotes", "試找來源與前週證據位置", 2400, "W12先存、W14課初定稿；W13換題不改寫W12，只補證據位置。候選題的實際搜尋詞、已開啟來源連結與位置（找不到如實記）；W9／W10作品入口與頁碼；W11原文核對與初稿位置。沒有數位入口可記紙本位置，缺項照實標待補。"]],
"w13-synthesis":[["references", "採用來源｜核對後的APA", 5000, "用S1、S2標來源；核對作者、日期、標題與連結。轉載要指出共同原始來源。"], ["passage", "相關原段落與位置", 5000, "先慢讀原文，再貼與問題有關的短段，標S1／S2、頁碼／段落及必要前後文。至少核對兩份相關原資料，可沿用舊來源；自己的整合判斷留紙本。"], ["searchPath", "實際搜尋路徑與缺口", 3000, "每個面向查了哪些詞、開哪些來源、尚缺什麼？找不到合用資料也如實記。用了AI，簡記它幫忙哪一步、自己如何核對與決定。"]],
"w14-expression":[["sourceNotes", "版本與來源入口", 3000, "本人草圖記p.2；貼Canva工作版名稱與連結，指定老師可以檢視，僅限加入者存取。資料不足可做已知／待查頁。用了AI，簡記協助、核對與本人決定。"]],
"w15-decision":[["sourceNotes", "個人簡報入口與版本", 2400, "先在試讀前送交Canva「W15試讀前V1」。此處貼V1作業與選用版的名稱、連結（同版註沿用）；V1不再動，修改先複製副本。作業內教師已能讀回時不另邀請；作業外工作版直接邀請老師可以檢視、僅限加入者存取，不用公開檢視連結。紙本備援記五頁作品入口或教師收件位置。用了AI，簡記協助、本人核對與決定。內容已在紙本，不必重打；若仍未保存就記待補。"]],
"w16-response":[["sourceNotes", "個人簡報定稿入口", 3000, "先送交Canva「W16定稿」。貼V1與定稿兩份作業的名稱、連結；作業內教師已能讀回時不另邀請。定稿後不覆寫，後續修訂另記日期。紙本備援記收件位置。實問、前提、回查與W13–W16證據索引已在p.1–3照片，不重打。教師追加問句標示在p.2第03題。"]],

 'w10-priority':[
  ['claim','我實際查核的精確原句',1000,'從原頁複製，保留發言者與必要條件。'],
  ['references','採用來源｜APA或核對後的來源資訊',2400,'沿用W9的格式，核對作者、日期、標題與連結。'],
  ['passage','相關原段落與位置',3000,'只貼相關短段，保留必要前後文；記段落或頁碼。'],
  ['searchPath','我實際怎麼找',1600,'搜尋詞、打開的來源；查到哪裡？若尚未找到，還缺什麼？']
 ],
 'w11-response':[['sourceNotes','我重述的原文入口與位置',2400,'發言者、日期、標題／連結、段落或頁碼。原文很短時可以一起貼入。']]
};
export const READING_PAGES={"w12-question":["p.1 兩個候選與起點", "p.2 試找後的個人問題V1", "p.3 真人回饋與本人新版", "p.4 檔案位置與待查點"],"w13-synthesis":["p.1 優先缺口與搜尋前期待", "p.2 原文理解與兩份資料關係", "p.3 來源關係與本人結論"],"w14-expression":["p.1 關鍵關係與必要條件", "p.2 本人起點版本", "p.3 比較候選與決定", "p.4 真人說回與本人改留"],"w15-decision":["p.1 我提出的安排", "p.2 兩輪互讀的雙向紀錄", "p.3 優先問題與本人改留理由", "p.4 新讀者結果"],"w16-response":["p.1 個人發表、同圈作品與提問", "p.2 實問卡、初答與回查補答", "p.3 本人回應與決定"],'w10-priority':['p.1 兩位讀者的排序','p.2 自己的排序與查後決定'],'w11-response':['p.1 初次理解','p.2 回饋與本人回應','p.3 比較問題初稿']};
export function readingFields(kind,m,esc){return '<input type="hidden" name="evidenceFormat" value="paper-judgment-v1"><p>紙本判斷不用重打。'+(kind==='w13-synthesis'?'下方可先儲存此裝置的來源草稿，照片最後補；草稿不算交件。':'先在自己的記事留草稿。')+' 按「保存作品」才會連同照片上傳。</p>'+READING_FIELDS[kind].map(([k,l,max,h])=>'<label>'+l+'<textarea name="'+k+'" maxlength="'+max+'" rows="3" '+(['claim','searchPath','sourceNotes'].includes(k)?'required':'')+' placeholder="'+esc(h)+'">'+esc(m?.[k]||'')+'</textarea></label>').join('')+(['w10-priority','w13-synthesis'].includes(kind)?'<label><input type="checkbox" name="noSource" '+(m?.noSource?'checked':'')+'>尚未找到可採用的來源（請在搜尋路徑寫出查到哪裡與缺口）</label>':'');}
export function readingValues(kind,values){return {evidenceFormat:'paper-judgment-v1',...Object.fromEntries(READING_FIELDS[kind].map(([k])=>[k,values.get(k)])),noSource:values.has('noSource')};}
export function readingEvidence(m,esc){if(m?.evidenceFormat!=='paper-judgment-v1'||!READING_FIELDS[m.readingKind])return '';const linked=t=>String(t).split(/(https?:\/\/[^\s]+)/g).map(x=>/^https?:\/\//.test(x)?'<a href="'+esc(x)+'" target="_blank" rel="noopener noreferrer">'+esc(x)+'</a>':esc(x)).join('');return '<section class="reading-evidence"><h3>來源與作品入口</h3><p>本人判斷、真人回饋與決定保留在下方紙本照片。</p>'+(m.noSource?'<p>尚未找到可採用來源；保留實際搜尋路徑。</p>':'')+READING_FIELDS[m.readingKind].filter(([k])=>m[k]).map(([k,l])=>'<h4>'+l+'</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+linked(m[k])+'</p>').join('')+'</section>';}

export function readingMetadata(meta){if(!READING_FIELDS[meta?.readingKind]||meta.evidenceFormat!=='paper-judgment-v1')return {};return Object.fromEntries(['evidenceFormat','readingKind','title','noSource',...READING_FIELDS[meta.readingKind].map(([k])=>k)].map(k=>[k,meta[k]]));}
