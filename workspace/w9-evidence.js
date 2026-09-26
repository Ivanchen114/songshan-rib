// W9: text belongs to a specific saved work version; old paper-only versions remain readable.
export const W9_FIELDS = [
 ['candidates','看過的新候選｜標題與連結',2400,'先看兩份新候選，原 A、B 不算；標出採用哪份及一句理由。若只找到一份，如實記錄。'],
 ['references','採用來源｜APA 第7版',3000,'只列實際採用的來源。請 NotebookLM 整理，再核對作者、日期、標題與原始網址。'],
 ['passage','關鍵原文與位置',2200,'貼一小段原文，標頁碼／小標／段落位置。不要把 AI 摘要當原文。'],
 ['verification','我回原文核對後，確認／修正了什麼？',1600,'交代來源資訊是否相符，以及 AI 有沒有說多、說錯或漏掉條件；仍不能確認也要說明。'],
 ['proposal','我的查核後提案',2400,'自己寫：現在建議怎麼做、理由與條件；哪些仍待確認。可修改或保留，不由 AI 代寫。'],
 ['aiUse','我用 NotebookLM 協助……',500,'一句話交代工具幫了什麼，例如找候選、定位原段落、整理 APA。']
];
export const APA_PROMPT='請為我選用的這份資料整理 APA 第7版參考文獻。先辨認資料類型，再列出作者／機構、日期、完整標題及原始網址。只用來源中可確認的資訊，不要猜；找不到的項目請另外標示。最後提供可複製的參考文獻。請引用原始資料，不要把 NotebookLM 當成這份資料的作者。';
export function w9Fields(meta,esc){return '<input type="hidden" name="evidenceFormat" value="digital-v1"><p>資料先在 NotebookLM 儲存為記事；最後貼到這裡，核對後連同紙本照片保存。這個表單尚未送出前不會自動保存。</p>'+W9_FIELDS.map(([key,label,max,hint])=>'<label>'+label+'<textarea name="'+key+'" rows="'+(key==='aiUse'?2:4)+'" maxlength="'+max+'" '+(['references','passage'].includes(key)?'':'required')+' placeholder="'+esc(hint)+'">'+esc(meta?.[key]||'')+'</textarea></label>').join('')+'<label><input type="checkbox" name="noSource" '+(meta?.noSource?'checked':'')+'>尚未找到可採用的資料（如實留下搜尋詞、候選與缺口，不硬湊 APA）</label><label>找不到時｜搜尋詞與仍缺的證據<textarea name="searchGap" rows="3" maxlength="1400">'+esc(meta?.searchGap||'')+'</textarea></label><details><summary>APA 提示詞與核對提醒</summary><p>'+esc(APA_PROMPT)+'</p><p>APA 寫對，表示資料找得回來；內容是否支持提案，仍要讀原段落判斷。沒有日期用 n.d.，不要拿今天日期補上。</p></details>';}
export function w9Values(values){return {evidenceFormat:'digital-v1',...Object.fromEntries(W9_FIELDS.map(([k])=>[k,values.get(k)])),noSource:values.has('noSource'),searchGap:values.get('searchGap')};}
export function w9Evidence(meta,esc){if(meta?.evidenceFormat!=='digital-v1')return '';const linked=t=>String(t).split(/(https?:\/\/[^\s]+)/g).map(part=>/^https?:\/\//.test(part)?'<a href="'+esc(part)+'" target="_blank" rel="noopener noreferrer">'+esc(part)+'</a>':esc(part)).join('');return '<section class="w9-evidence"><h3>資料依據與查核後提案</h3>'+ (meta.noSource?'<p>尚未找到可採用資料；以下保留搜尋紀錄與缺口。</p>':'')+W9_FIELDS.filter(([k])=>meta[k]).map(([k,label])=>'<h4>'+label+'</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+linked(meta[k])+'</p>').join('')+(meta.searchGap?'<h4>搜尋紀錄與缺口</h4><p style="white-space:pre-wrap">'+esc(meta.searchGap)+'</p>':'')+'</section>';}
