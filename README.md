# R.I.B. · 閱讀理解與表達

松山高中校訂必修《閱讀理解與表達》18 週簡報網站。

**R.I.B.** = Reading · Intelligence · Being

## 現行教材入口｜2026-09-05

- 本輪教學與教材修訂到 W7。首頁以 W1–W7 為主要入口；W8–W18 保留原版連結，標為「待本輪修訂」，不是全學期均已完成本輪修訂。
- `worksheets/#disciplinary` 提供 W1–W6 學科練習、提示、詳解入口；`worksheets/#weekly` 每週只下載 Wn.pdf／docx 一份歷程本。W1／W3／W4／W5 共 6 頁；W2 共 8 頁；W6 共 8 頁，其中第 7–8 頁歷史可不印、自留。
- W1–W7 已整合兩節各 50 分鐘（下課另計）。生活題與學科方法都保留，課內完成初答、搭檔回饋與本人改留；原題的額外部分、變式與詳解可回家選做，不計分、不追交、不列缺件。W7 為 31 頁，先示範麥當勞真實廣告，再換 YouBike 同事件材料練習。
- 投影以 `Wn/index.html` 為母版。課程目錄以 `build_tools/build_merged_academic_workbooks.py` 重建同週完整歷程本，以 `refine_academic_visuals.py` 重建學科圖解，以 `sync_merged_academic_delivery.py` 同步公開檔。教師逐字稿 Markdown 為教師來源。舊一次性遷移已有防覆寫保護。學科頁不另上傳、不新增評分；W6 歷史自留。原獨立卡已封存，舊公開 URL 轉向當週歷程本。

---

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

每週簡報是**單一 self-contained HTML**：圖片以 base64 內嵌、CSS/JS 內嵌、字體走 Google Fonts CDN；檔案大小隨內嵌材料而異，離線可使用系統字型。

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
