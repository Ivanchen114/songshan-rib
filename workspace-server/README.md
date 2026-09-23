# R.I.B. 作品區

W4／W5 小組文字轉圖已於 2026-09-23 在原課程網站正式啟用。

- [操作說明](docs/操作說明.md)
- [系統與維護](docs/系統說明與維護.md)
- [正式發布紀錄](cloud/production-status.md)

安裝：`npm ci`。虛構資料測試：`npm run test:workspace`。本機虛構示範：`npm run dev:workspace`。建置公開課程：`npm run build:site`。

環境變數參考 `.env.example`，只存伺服器。正式站 RIB_ENABLED=true、RIB_GOOGLE_ENABLED=true、RIB_ACCEPTANCE_ONLY=false。原來的驗收資料庫與 R2 bucket 已改為正式用途，不得重置、重新初始化或重跑 seed。預覽必須使用獨立環境。

學生透過 API 及短效授權上傳／讀取圖片。名單、驗證值、評閱、備份與服務金鑰不得放進 public/。只把指定課程資料夾複製到 public/，而不是把整個專案當靜態站發佈。
