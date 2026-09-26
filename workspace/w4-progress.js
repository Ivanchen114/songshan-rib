// Status describes saved evidence, not quality or automatic grading.
export const hasHumanFeedback=w=>w?.hasHumanFeedback??!!(w?.feedback?.length||w?.teacherReadings?.some(r=>r.mode==='human'));
export function w4Progress(w){
 if(!w?.versions?.length)return {step:0,status:'作品未交',title:'先保存我的圖卡',detail:'原意留在歷程本，這裡上傳自己的圖卡。'};
 if(!hasHumanFeedback(w))return {step:1,status:'待初讀',title:'作品已保存，等候真人初讀回饋',detail:'同學或老師親自看圖並發布回饋後，再對照原意與畫面，決定修改或保留。'};
 if(!w.decisions?.length)return {step:2,status:'待本人修改或保留',title:'收到真人回饋了，接著決定修改或保留',detail:'修改請上傳 V2 並填修改依據；保留請按「有理由保留目前版本」，說明原意、回饋與畫面之間的理由。'};
 if(w.grades?.some(g=>g.status==='graded'))return {step:3,status:'已評閱',title:'老師已完成評閱',detail:'可以回看作品版本、自己的修改或保留理由，以及老師的評語。'};
 if(w.w5JudgmentStatus!=='submitted')return {step:3,status:w.w5JudgmentStatus==='draft'?'已記錄修改或保留，W5 判讀待送出':'已記錄修改或保留，待 W5 判讀',title:'W4 的修改或保留已記錄',detail:w.w5JudgmentStatus==='draft'?'W5 判讀目前是草稿。完成判讀依據與改後一句，再按送出；老師會合看兩週紀錄評閱。':'接著在 W5 完成 AI 留言判讀與改後一句並送出；老師會合看兩週紀錄評閱。'};
 return {step:3,status:'W4 與 W5 判讀已記錄，待教師評閱',title:'W4 與 W5 判讀已記錄',detail:'老師接著合看圖卡、真人回饋、修改或保留的理由與 W5 判讀。已記錄不代表內容已達標。'};
}
