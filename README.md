# R.I.B. · 閱讀理解與表達

松山高中校訂必修《閱讀理解與表達》18 週簡報網站。

**R.I.B.** = Reading · Intelligence · Being

---

## 結構

```
songshan-rib/
├── index.html              # 首頁
├── W1/index.html           # 第 1 週簡報
├── W2/index.html           # 第 2 週簡報
├── W3/index.html           # （未完成 — 製作中時加入）
├── ...
├── W18/index.html
├── README.md
└── .gitignore
```

每週簡報是**單一 self-contained HTML**：所有圖片以 base64 內嵌、CSS/JS 內嵌、字體走 Google Fonts CDN。檔案 200KB–500KB 不等。

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
5. **更新首頁**：把 `index.html` 的 `W{N}` card 從 `pending` 改為可點，把 `WAIT` 改為 `DONE`
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
