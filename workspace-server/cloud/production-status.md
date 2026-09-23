# W4／W5 正式發布紀錄

日期：2026-09-23（Asia/Taipei）

## 已啟用

- 正式入口：https://songshan-rib.vercel.app/workspace/ 。原 portfolio 的 week=4／5 帶到新作品區。舊驗收網址轉往正式站。
- 學期 11501；71 位正式學生原資料與驗證資料保留。兩位管理教師均可查看 108／109。測試活動及帳號隔離，不對外公開。
- W4 保留 exhibit（班內展示），W5 小組保留 production（製作與上傳），兩活動開放保存。其他舊活動仍用原 GAS。
- 舊試算表 Activities!B3、B7 的活動設為 accepting=false、interacting=false、closed=true；不刪除舊資料、不雙寫。
- Supabase、R2 均沿用已驗證的搬遷內容。bucket 名稱 rib-private-staging 雖有 staging 字樣，現在是正式資料，不能重建、清空或重跑 seed。
- Google Auth 正式 Site URL 與 callback、R2 CORS 已加入正式網域。RIB_ENABLED=true、RIB_GOOGLE_ENABLED=true、RIB_ACCEPTANCE_ONLY=false。

## 備份與驗證

使用者明確確認原站沒有新增資料，故以既有已核對快照切換。完整切換前備份位於網站以外私密目錄 `/Users/Ivan/.codex/private/rib-production-cutover-20260923/bundle-1790151600479/`，547 個媒體，95,972,561 bytes。資料庫備份 SHA-256：`746ce866d12e3b2cc36f1fa684f2640935712d78cd4a47a9d09f477a3af3275c`。已實際還原到空白 PGlite，核對持久表筆數；還原後活動停寫。

- 本機權限、流程、學期管理、同意、公開與備份測試 33 項通過；新增測試帳號不得建立正式作品檢查亦通過。
- 正式網域：Google 教師登入、兩班查閱、測試學生原六碼登入及 W5 兩張虛構圖上傳、保存、教師讀圖。
- R2：正式來源 CORS、簽署上傳、圖像衍生及 EXIF 移除、無授權／錯誤簽章拒絕。獨立媒體 smoke 產物已移除。
- 同一測試工作階段 35 個並行讀取全部成功，p95 1.328 秒、最大 1.466 秒。不是 35 位不同學生同時上傳，也不是教室 Wi-Fi 或實機相簿驗收。
- 正式學生資料與驗證值切換前後比對不變；未代勾真實學生同意、未建立真人邀請、未更動評閱。舊作品不因切換自動公開。

## 後續部署

網站採 `npm run build:site`／`workspace-server/scripts/build-site.mjs` 複製指定公開課程資料夾到 public/。api/ 與 workspace-server/ 不作靜態公開。vercel.json 設定 public 輸出及 workspace API；保留它們，不能回用只部署舊靜態網站的設定。

原工作目錄另有未完成教材變更。本次來源以原正式 b2d76e8 為底，僅加作品區及 W4／W5 入口。不要把未審查的整個工作目錄直接發佈。伺服器環境變數保存在 Vercel，備份及憑證不進 Git。

R2 物件權杖到期日為 2026-10-23，須在到期前續換並測上傳／讀取。教師重發六碼的管理介面尚未提供；必要時由維護者在新資料庫完成，不要改舊試算表。

## 故障與復原

保留舊正式課程部署與正式啟用部署供前端回復。新站若已有新交件，不得直接重新開放舊 GAS：先關閉新活動保存，備份新資料庫與所有新增媒體；在獨立空白環境還原並核對，再修復或移交新增紀錄。以入口回舊站不等於資料復原。

舊兩活動 JSON 原值另存私密 `old-activity-switches.json`。重開前必須核對是否已有新站資料。備份不包含可沿用的登入工作階段，還原後需重新登入。不要覆寫、刪除原 R2 圖片或直接對正式資料庫執行 restore／migration。
