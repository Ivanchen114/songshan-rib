# R.I.B. · 閱讀理解與表達

松山高中校訂必修《閱讀理解與表達》18 週簡報網站。

**R.I.B.** = Reading · Intelligence · Being

## 現行教材入口｜2026-09-06

- W1–W18 已完成本輪 SOIL 修訂，共 564 頁投影。首頁提供全學期入口，亮色為主、情境頁採水彩插畫，保留原始媒體與精確圖解。
- `worksheets/#weekly` 每週下載 Wn.pdf／docx 一份完整歷程本；18 份共 108 頁。W1–W15 學科選做已併入同週本冊，練習、提示及參考詳解入口在 `worksheets/#disciplinary`，詳解位於投影末段。W16–W18 優先成果、正式取證與自主收束，可回看題庫。
- 每週維持兩節各 50 分鐘（下課另計），沿用四人桌及 AB／CD 雙人搭檔。生活練習依教學目標安排，學科是有餘裕或課餘的選做備案，不加分、不追交、不列缺件，也不擠掉必要閱讀、本人改留及收件。
- 常態 W1–W17 下課前拍本人必要作答頁，上傳原 Classroom 作業並確認繳交後，整本交回。學科不另設必交作業；收本後可從同一份線上歷程本取題。W18 全本發還、自主收束、不強制上傳。
- `Wn/index.html` 為投影母版，課程目錄保留同週 HTML 鏡像、完整歷程本建置器、教師稿與必要離線衍生。正式評分依 v7 規準，公開網站不放教師逐字稿及受控考卷。已撤回的獨立學科卡 URL 轉向同週完整歷程本；W8 舊預讀版連結亦提供目前八頁合本。
- 以本機驗收、Git 提交／推送、正式站逐檔雜湊及瀏覽器操作分別記錄版本。真實課堂成效與實體列印另行驗證。

---

## 投影與閱讀

W1–W18 共用同一份內容、頁碼與逐步揭露。桌機預設投影版（1600×900 檢視）；手機／觸控裝置預設閱讀版，直屏、橫屏自然換行並可向下捲動。使用者可切換，保留當頁、提示與計時；選單提供跳頁、學科題、詳解及本週歷程本。圖表可放大，寬表可左右滑；閱讀空白處不再翻頁。

網址可用 `?view=reading#14` 或 `?view=projection#14` 明確指定當頁呈現。教室電腦若曾用閱讀版，可切回投影版。靜態匯出使用 `?export=1` 排除個人閱讀介面；HTML 仍為可操作母版。

## 結構

```
songshan-rib/
├── index.html              # 首頁
├── W1/index.html           # 第 1 週現行白話版簡報
├── W2/index.html           # 第 2 週簡報
├── W3/index.html           # 第 3 週（2026-07 合併版：捕捉與選材）
├── W7/index.html           # 第 7 週（同一事件，為什麼看到的不同？）
├── ...
├── W18/index.html
├── README.md
└── .gitignore
```

> **2026-07 改號紀錄**：原 W3/W4 合併為新 W3；原 W5/W6/W7 依序改為 W4/W5/W6；
> 新 W7 由訊息生態週發展為「雙畫面比較＋透明排序器」；原 W4 deck 移至 `_archive_2026-07/`。
> W1 原版已封存於 `_archive_2026-07/W1_原版/`；正式入口只維護 `W1/index.html`。

每週簡報以單一 HTML 為主，CSS／JS 與多數材料圖內嵌，共用背景及部分圖解由 assets 提供。字型使用網站自帶的 Noto Sans TC、Noto Serif TC 與 JetBrains Mono 子集；黑體為主，明體只用於適合精讀的語句，數字介面用等寬字。離線鏡像使用課程目錄內相應資源，不依賴 Google Fonts CDN。

URL 結構：
- `/` → 首頁
- `/W1/` → 第 1 週
- `/W2/` → 第 2 週

---

## 加新一週的流程

依最新版 `soil-course-deck` 與 `soil-course-worksheet` 操作。

1. 讀目標、評量、前後活動及全部投影、紙本、教師稿。
2. 先檢查 L → I → O → S，再走讀投影任務、學生產出與教師收束。
3. 沿用有效圖像；可準確文轉圖的關係直接製作並嵌入，逐組同步揭露。
4. 修改 `Wn/index.html`，同步課程目錄的 HTML 鏡像、紙本、教師口令、時間及離線衍生。
5. 實測 1600×900 初始、中間與全顯，以及前進、返回、計時及既有控制。
6. 依實際修訂範圍同步首頁與下載中心；經授權 commit + push 後核對正式網址內容與檔案雜湊。

---

## 本地預覽

```bash
cd songshan-rib
python3 -m http.server 8000
# 瀏覽器開 http://localhost:8000
```

---

## 部署（Vercel）

1. 把 `songshan-rib/` 推到 GitHub repo（建議 repo 名 `songshan-rib`）
2. Vercel → New Project → 連 GitHub → 選 repo
3. **Framework Preset**: Other（純靜態）
4. **Root Directory**: `./`（如果 repo 根就是 songshan-rib 內容）
5. Deploy → 拿到 `songshan-rib.vercel.app`

之後每次 `git push`，Vercel 自動重 deploy（約 30 秒）。

---

## Google 搜尋與索引

網站的正式網址是 `https://songshan-rib.vercel.app/`；首頁 `canonical`、`robots.txt`、`sitemap.xml`
與 WebSite JSON-LD 都必須統一使用這個網域。

本地驗證：

```bash
node scripts/qa_seo.mjs
```

發布後的線上驗收：

```bash
curl -I https://songshan-rib.vercel.app/
curl -I https://songshan-rib.vercel.app/robots.txt
curl -I https://songshan-rib.vercel.app/sitemap.xml
```

三個網址都回傳 HTTP 200 後，到 Google Search Console 新增「網址前綴」資源：
`https://songshan-rib.vercel.app/`，完成擁有權驗證，送出 `sitemap.xml`，再用「網址審查」對首頁執行
「測試線上網址」與「要求建立索引」。Google 是否納入索引與排名仍由 Google 決定。

---

## 姊妹站

- [研究方法與專題](https://research-navigator-nu.vercel.app/)（高一研究方法）

---

## 簡報快捷鍵

| 鍵 | 動作 |
|---|---|
| ← → / 空白 | 前後揭露／切頁 |
| P | 當頁全顯／回初始 |
| F | 全螢幕 |
| Home / End | 首頁／末頁 |
| 點畫面左右 30% | 切頁 |

---

_台北市立松山高中 · 校訂必修 · 課堂 ＋ 自學雙模式_
