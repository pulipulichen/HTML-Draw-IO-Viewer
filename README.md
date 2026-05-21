# HTML AI Diagram Editor

[English](./README.md) | [繁體中文](./README_zh_tw.md)

A lightweight browser app for loading, previewing, and AI-editing Draw.io and Mermaid diagrams.  
It combines the Draw.io viewer, Mermaid rendering, and Gemini-powered workflows in a pure frontend architecture, including highlighted snapshots, full-diagram snapshots, and local version history.

- Online demo: [https://pulipulichen.github.io/HTML-AI-Diagram-Editor/](https://pulipulichen.github.io/HTML-AI-Diagram-Editor/)

## Features

- Load diagrams from local `.drawio` / `.xml` / `.mmd` / `.mermaid` files, XML URLs, or built-in samples (`demo/drawio_example1.drawio`, `demo/mermaid_example1.mmd`).
- Switch source format with `Auto / Draw.io / Mermaid`; the current-mode badge toggles directly between Draw.io and Mermaid and loads the matching sample.
- Live preview supports pan/zoom and minimap navigation for both Draw.io and Mermaid in the same viewer area.
- Ask Gemini to generate or modify diagrams from natural-language prompts; Mermaid mode keeps Mermaid output by default unless Draw.io conversion is explicitly requested.
- Add highlighted-region snapshots (rectangle, polygon, freehand) and attach full-diagram snapshots as visual AI context.
- Attach reference files (`txt`, `md`, `xml`, `json`, `js`, `css`, `html`, etc.) for richer AI instructions.
- Keep prompt history in-browser (search, refill, delete, clear all) and AI version history (restore, copy, download).
- Export is mode-aware: Draw.io mode downloads XML, Mermaid mode downloads MMD, and PNG export stays available.
- Keyboard shortcuts: `Ctrl/Cmd + S` downloads XML/MMD, and `Ctrl/Cmd + Shift + S` exports transparent PNG.
- XML/MMD and PNG exports both show global loading overlays for clearer progress feedback.
- Built-in internationalization (English and Traditional Chinese) with language switching.
- PWA support with service worker registration.

## Tech Stack

- HTML5 + Vanilla JavaScript (ES Modules)
- Tailwind CSS (CDN)
- Draw.io viewer script (`viewer-static.min.js`)
- Mermaid (runtime-loaded `mermaid.esm.min.mjs`)
- Gemini API (client-side request flow)
- Browser APIs: `localStorage`, `Service Worker`, `File API`, `Canvas`

## Getting Started

1. Clone this repository:

   ```bash
   git clone https://github.com/pulipulichen/HTML-Draw-IO-Viewer.git
   cd HTML-Draw-IO-Viewer
   ```

2. Serve the project with any static file server (recommended for service worker behavior), for example:

   ```bash
   python3 -m http.server 4173
   ```

3. Open `http://localhost:4173` in your browser.

## Basic Usage

1. Load diagram source from sample, local file, or URL.
   - To load Mermaid sample from UI: switch source format to `Mermaid`, then click `Load Sample`.
2. Edit Draw.io XML or Mermaid text directly in the source panel and preview updates live.
3. Open **Gemini Settings** and provide your Gemini API key/model.
4. Enter a prompt in the AI tab (optionally attach references, highlighted snapshots, or a full snapshot).
5. Reuse prompts from prompt history, then review and restore/download results from version history.
6. Export XML/MMD (mode-aware) or transparent PNG.
   - Shortcut: `Ctrl/Cmd + S` for XML/MMD download, `Ctrl/Cmd + Shift + S` for transparent PNG export.

## Data and Storage

- The app stores data in browser `localStorage` (source content, source mode, AI prompt draft/history, version history, tab state, file name, Gemini settings).
- API keys are persisted locally in the same browser profile.
- No dedicated backend is included in this repository.

## Notes

- URL import depends on target server CORS policy.
- Mode switch loads that mode's sample; when current content differs from sample content, the app asks for confirmation before overwrite.
- Very large XML may not fit Draw.io URL length limits; the app falls back to file download behavior.
