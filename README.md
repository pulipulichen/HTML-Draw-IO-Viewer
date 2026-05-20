# HTML Draw.io Viewer

[English](./README.md) | [繁體中文](./README_zh_tw.md)

A lightweight browser app for loading, previewing, and editing Draw.io XML diagrams.  
It combines the Draw.io viewer with Gemini-powered prompt editing, highlighted-region context, and local version history in a pure frontend architecture.

- Online demo: [https://pulipulichen.github.io/HTML-Draw-IO-Viewer/](https://pulipulichen.github.io/HTML-Draw-IO-Viewer/)

## Features

- Load diagrams from local `.drawio` / `.xml` files, XML URLs, or built-in sample XML.
- Live XML preview with pan/zoom interaction and a minimap navigator.
- Ask Gemini to generate or modify diagram XML from natural language prompts.
- Add highlighted regions (rectangle, polygon, freehand) and send them to Gemini as visual context.
- Attach reference files (`txt`, `md`, `xml`, `json`, `js`, `css`, `html`, etc.) for richer AI instructions.
- Keep AI version history in-browser and restore any previous result.
- Export XML by download or open current XML directly in Draw.io.
- Built-in internationalization (English and Traditional Chinese) with language switching.
- PWA support with service worker registration.

## Tech Stack

- HTML5 + Vanilla JavaScript (ES Modules)
- Tailwind CSS (CDN)
- Draw.io viewer script (`viewer-static.min.js`)
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

1. Load diagram XML from sample, local file, or URL.
2. Edit XML directly in the source panel and preview updates live.
3. Open **Gemini Settings** and provide your Gemini API key/model.
4. Enter a prompt in the AI tab (optionally attach references and highlighted snapshots).
5. Apply AI result, review history, then export XML.

## Data and Storage

- The app stores data in browser `localStorage` (XML content, AI prompt/history, tab state, Gemini settings).
- API keys are persisted locally in the same browser profile.
- No dedicated backend is included in this repository.

## Notes

- URL import depends on target server CORS policy.
- Very large XML may not fit Draw.io URL length limits; the app falls back to file download behavior.
