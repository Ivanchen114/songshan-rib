// Labels describe the current viewer's relationship, never a guessed identity.
export function conversationSource(viewer,role,initial=false){
 if(role==='teacher')return {source:'teacher',label:'老師回覆'};
 const own=viewer===role;
 return {source:own?'student':'peer',label:initial?(own?'我的初讀 · 原文':viewer==='teacher'?'讀者初讀 · 學生原文':'同學初讀 · 學生原文'):(own?'我的回覆 · 原文':`${role==='author'?'作者':'讀者'}回覆 · 同學原文`)};
}
export function conversationMarkup(c,esc){
 const initial=conversationSource(c.viewer,'reader',true);
 return `<div class="feedback authored source-${initial.source}"><strong class="source-label">${initial.label}</strong><p>${esc(c.review.situation)}</p><p>${esc(c.review.meaning)}</p></div>`+c.replies.map(r=>{const info=conversationSource(c.viewer,r.label);return `<div class="feedback authored source-${info.source}"><strong class="source-label">${info.label}</strong><p>${esc(r.body)}</p></div>`;}).join('');
}
