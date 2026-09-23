import {sha} from './security.mjs';
export const AGREEMENT_VERSION='rib-sharing-2026-09-23-v1';
export const SHARING_AGREEMENT={version:AGREEMENT_VERSION,title:'作品匿名展示與個資保護說明',paragraphs:[
 '本學期在這個作品區繳交的作品，預設可在網站匿名展廳公開，未登入的人也能瀏覽。既有作品不會因這次勾選立即公開。',
 '展廳不顯示姓名、學號、班級、座號、同儕回饋或成績；照片的附加資訊會移除。圖片內容不會被系統自動辨識或遮字，上傳前請移除可辨識人像、姓名、名牌及私人對話，也不要散布自己或他人的個資。',
 '若某週作品不想公開，可在作品下按「不公開」。作品仍可交件、收到回饋與評分。小組任一成員選擇不公開，整份作品就不展示；其他人不能代替他恢復公開。',
 '老師可檢查或撤下作品。撤回後展廳不再列出，已發出的圖片短連結最多仍有效 120 秒；已被他人下載的副本無法收回。',
 '這份設定只適用本學期；換學期或說明內容有實質更新時，會再次請你確認。'
]};
export const AGREEMENT_HASH=sha(JSON.stringify(SHARING_AGREEMENT));
export const hasAgreement=s=>s?.sharing_agreement?.version===AGREEMENT_VERSION&&s.sharing_agreement.documentHash===AGREEMENT_HASH;
