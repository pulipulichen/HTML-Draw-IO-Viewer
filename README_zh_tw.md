# HTML AI Diagram Editor

[English](./README.md) | [繁體中文](./README_zh_tw.md)

這是一個輕量化的瀏覽器應用，提供 Draw.io / Mermaid 圖表的載入、預覽與 AI 編輯。  
專案以純前端架構整合 Draw.io Viewer、Mermaid 渲染與 Gemini 對話式工作流，並提供標亮快照、完整快照與本機版本記錄功能。

- 線上示範：[https://pulipulichen.github.io/HTML-Draw-IO-Viewer/](https://pulipulichen.github.io/HTML-Draw-IO-Viewer/)

## 功能特色

- 支援從本機 `.drawio` / `.xml` / `.mmd` / `.mermaid` 檔、XML 網址或內建範例（`demo/drawio_example1.drawio`、`demo/mermaid_example1.mmd`）載入圖表。
- 支援來源格式 `Auto / Draw.io / Mermaid` 切換；目前模式徽章可一鍵在 Draw.io 與 Mermaid 間切換並載入對應範例。
- 即時預覽支援平移、縮放與 minimap 導覽；Draw.io 與 Mermaid 都可在同一預覽區操作。
- 可透過自然語言請 Gemini 產生或修改圖表；Mermaid 模式預設回傳 Mermaid，需求中明確指定時可轉 Draw.io XML。
- 支援標亮區域（矩形、多邊形、手繪）快照，以及附上完整圖表快照作為 AI 視覺上下文。
- 可附加參考檔案（`txt`、`md`、`xml`、`json`、`js`、`css`、`html` 等）強化 AI 指令。
- 內建提示詞歷史（搜尋、回填、單筆刪除、全部清空）與 AI 版本歷史（回復、複製、下載）。
- 匯出行為為模式感知：Draw.io 模式下載 XML；Mermaid 模式下載 MMD；PNG 匯出皆可使用。
- 支援快捷鍵：`Ctrl/Cmd + S` 下載 XML/MMD、`Ctrl/Cmd + Shift + S` 匯出透明 PNG。
- XML/MMD 與 PNG 匯出時都會顯示全域 loading overlay，提供一致的匯出回饋。
- 內建多語系（English / 繁體中文）切換。
- 支援 PWA（含 service worker 註冊）。

## 技術堆疊

- HTML5 + Vanilla JavaScript（ES Modules）
- Tailwind CSS（CDN）
- Draw.io viewer script（`viewer-static.min.js`）
- Mermaid（執行時載入 `mermaid.esm.min.mjs`）
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
   - 若要載入 Mermaid 範例：先把來源格式切到 `Mermaid`，再按「載入範例」。
2. 在原始碼區直接編輯 Draw.io XML 或 Mermaid 文字，右側即時預覽。
3. 到 **Gemini 設定** 填入 Gemini API Key 與模型名稱。
4. 在 AI 分頁輸入提示詞（可選擇附加參考檔、標亮快照或完整快照）。
5. 可從提示詞歷史快速回填常用需求，送出後在版本紀錄中回復或下載任一結果。
6. 依目前模式匯出 XML/MMD 或透明 PNG。
   - 快捷鍵：`Ctrl/Cmd + S` 下載 XML/MMD、`Ctrl/Cmd + Shift + S` 匯出透明 PNG。

## 資料與儲存

- 應用會將資料儲存在瀏覽器 `localStorage`（來源內容、來源模式、AI 提示詞草稿/歷史、版本記錄、分頁狀態、檔名、Gemini 設定）。
- API Key 僅儲存在目前瀏覽器設定檔中。
- 此儲存庫未提供獨立後端服務。

## 注意事項

- 從 URL 載入 XML 會受目標站台的 CORS 設定限制。
- 切換目前模式時會載入該模式範例；若目前內容不同於範例，系統會先詢問確認再覆蓋。
- XML 過大時可能超出 Draw.io URL 長度限制；系統會改採下載檔案方式處理。
