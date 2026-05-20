# HTML Draw.io Viewer

[English](./README.md) | [繁體中文](./README_zh_tw.md)

這是一個輕量化的瀏覽器應用，提供 Draw.io XML 圖表的載入、預覽與編輯。  
專案以純前端架構整合 Draw.io Viewer 與 Gemini 對話式編輯，並提供標亮區域上下文與本機版本記錄功能。

- 線上示範：[https://pulipulichen.github.io/HTML-Draw-IO-Viewer/](https://pulipulichen.github.io/HTML-Draw-IO-Viewer/)

## 功能特色

- 支援從本機 `.drawio` / `.xml` / `.mmd` / `.mermaid` 檔、XML 網址或內建範例（`demo/example.drawio`、`demo/example.mmd`）載入圖表。
- XML 即時預覽，支援平移、縮放與 minimap 導覽。
- 可透過自然語言請 Gemini 產生或修改圖表 XML。
- 支援標亮區域（矩形、多邊形、手繪）並作為 Gemini 的視覺上下文。
- 可附加參考檔案（`txt`、`md`、`xml`、`json`、`js`、`css`、`html` 等）強化 AI 指令。
- 內建瀏覽器端 AI 版本歷史，可回復任一過往結果。
- 支援下載 XML，或直接將目前 XML 帶入 Draw.io 開啟。
- 支援快捷鍵：`Ctrl/Cmd + S` 下載 XML、`Ctrl/Cmd + Shift + S` 匯出透明 PNG。
- XML 與 PNG 下載時都會顯示全域 loading overlay，提供一致的匯出回饋。
- 內建多語系（English / 繁體中文）切換。
- 支援 PWA（含 service worker 註冊）。

## 技術堆疊

- HTML5 + Vanilla JavaScript（ES Modules）
- Tailwind CSS（CDN）
- Draw.io viewer script（`viewer-static.min.js`）
- Gemini API（前端端點請求流程）
- Browser APIs：`localStorage`、`Service Worker`、`File API`、`Canvas`

## 快速開始

1. 下載專案：

   ```bash
   git clone https://github.com/pulipulichen/HTML-Draw-IO-Viewer.git
   cd HTML-Draw-IO-Viewer
   ```

2. 使用任一靜態檔案伺服器啟動（為了 service worker 行為，建議不要直接用 `file://` 開啟）：

   ```bash
   python3 -m http.server 4173
   ```

3. 在瀏覽器開啟 `http://localhost:4173`。

## 基本使用流程

1. 先從範例、本機檔案或網址載入圖表內容。
   - 若要載入 Mermaid 範例：先把來源格式切到 `Mermaid`，再按「載入範例 XML」。
2. 在原始碼區直接編輯 XML，右側即時預覽。
3. 到 **Gemini 設定** 填入 Gemini API Key 與模型名稱。
4. 在 AI 分頁輸入提示詞（可選擇附加參考檔與標亮快照）。
5. 套用 AI 結果、檢視版本歷史，最後匯出 XML/PNG。
   - 快捷鍵：`Ctrl/Cmd + S` 下載 XML、`Ctrl/Cmd + Shift + S` 匯出透明 PNG。

## 資料與儲存

- 應用會將資料儲存在瀏覽器 `localStorage`（XML、AI 提示詞/歷史、分頁狀態、Gemini 設定）。
- API Key 僅儲存在目前瀏覽器設定檔中。
- 此儲存庫未提供獨立後端服務。

## 注意事項

- 從 URL 載入 XML 會受目標站台的 CORS 設定限制。
- XML 過大時可能超出 Draw.io URL 長度限制；系統會改採下載檔案方式處理。
