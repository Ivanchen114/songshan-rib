# R.I.B. · 閱讀理解與表達

松山高中校訂必修《閱讀理解與表達》18 週簡報網站。

**R.I.B.** = Reading · Intelligence · Being

## 現行教材入口｜2026-09-05

- 本輪教學與教材修訂到 W7。首頁以 W1–W7 為主要入口；W8–W18 保留原版連結，標為「待本輪修訂」，不是全學期均已完成本輪修訂。
- `worksheets/#disciplinary` 提供 W1–W6 六份學科遷移卡（共 14 頁）的 PDF／DOCX，並連到各週練習、提示及最後詳解。詳解是依課堂安排公開的學生回讀材料；教師逐字稿、評分答案與受控評量題本仍不放公開站。
- W1–W6 原 100 分鐘流程保留；新增學科延伸尚未重新排入原時程。W7 是 27 頁、100 分鐘修訂版。
- 首頁與下載中心本輪修訂來源：課程目錄 `build_tools/refresh_home_and_downloads_20260905.py`；投影仍以本 repo 的 `Wn/index.html` 為母版，學科卡由課程目錄 `build_tools/add_disciplinary_end_tasks.py` 建置。

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

> Claude 端流程，詳見 `rib-deck` skill

1. **素材勘查**：讀 `W{N}/W{N}_教師流程速查.md`、`W{N}/W{N}_完整簡報.pptx`、`閱讀理解與表達_18週課程認知與負荷審查報告.md` 對應章節
2. **章節骨架**：教師確認頁面結構
3. **圖像清單**：教師到 ChatGPT / Gemini 生圖，丟到 `W{N}/assets/`
4. **建 HTML**：build 腳本輸出到 `songshan-rib/W{N}/index.html`
5. **更新首頁**：依實際修訂範圍更新狀態、週次摘要與下載入口；既有原版可開啟，不代表已完成本輪修訂。同步 `worksheets/index.html`。
6. **commit + push** → Vercel 自動 deploy

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
| ← → / 空白 | 切頁 |
| F | 全螢幕 |
| Home / End | 首頁／末頁 |
| 點畫面左右 30% | 切頁 |

---

_台北市立松山高中 · 校訂必修 · 課堂 ＋ 自學雙模式_
