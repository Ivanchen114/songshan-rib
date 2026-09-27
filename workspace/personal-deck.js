// Individual five-slide report. Separate kind protects historical group ownership.
export const PERSONAL_DECK_KIND='w15-personal-deck';
export const DECK_PURPOSES=['試讀版','試讀修訂','發表定稿','提問後修訂'];
export const DECK_FIELDS=[['question','我選定的問題',600],['audience','這份簡報給誰看',400],['references','來源與核對後的 APA',5000],['aiUse','AI 使用說明（有用才填）',1500]];
export function deckValues(values){return Object.fromEntries(DECK_FIELDS.map(([k])=>[k,values.get(k)]));}
export function deckMetadata(m){return m?.reportFormat==='personal-five-slides-v1'?Object.fromEntries(['reportFormat','title','purpose',...DECK_FIELDS.map(([k])=>k)].map(k=>[k,m[k]])):{};}
export function deckEvidence(m,esc){if(m?.reportFormat!=='personal-five-slides-v1')return '';return '<section class="personal-deck-evidence"><h3>'+esc(m.title)+'</h3><p>個人五頁簡報 · '+esc(m.purpose)+'</p>'+DECK_FIELDS.filter(([k])=>m[k]).map(([k,l])=>'<h4>'+l+'</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+String(m[k]).split(/(https?:\/\/[^\s]+)/g).map(t=>/^https?:\/\//.test(t)?'<a href="'+esc(t)+'" target="_blank" rel="noopener noreferrer">'+esc(t)+'</a>':esc(t)).join('')+'</p>').join('')+'</section>';}
