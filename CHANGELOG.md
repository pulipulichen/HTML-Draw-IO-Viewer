# Changelog

## 0.0.2

### Added

- Added Mermaid source preview support with format-aware rendering (`auto`, `drawio`, `mermaid`) and runtime Mermaid module loading.
- Added source format selector in the editor toolbar to explicitly switch preview mode.
- Added Mermaid-to-Draw.io AI conversion action in the AI panel for one-click transformation workflow.
- Added Mermaid sample assets and moved all sample files under `demo/` (`example.drawio`, `example2.drawio`, `example.mmd`, `example2.mmd`).
- Added Mermaid E2E coverage in `e2e/mermaid.spec.js` for Mermaid render path and `.mmd` file import behavior.
- Added `sourceFormat` persistence in `localStorage` to keep user format preference across reloads.

### Changed

- Updated sample loading behavior so `Load Sample` now follows current source format (`Draw.io` loads `demo/example.drawio`, `Mermaid` loads `demo/example.mmd`).
- Updated sample/demo file paths used by runtime logic (startup sample load, AI demo load, service-worker cache list, and E2E file paths) to the `demo/` directory.
- Updated import support to include Mermaid file extensions (`.mmd`, `.mermaid`).
- Updated version history entries to persist and display the source mode captured at creation time (instead of showing only the current global mode).
- Updated app branding/title text across HTML title, i18n metadata, and PWA manifest to `AI Dragram Editor` (including `short_name`).
- Updated Mermaid-mode AI behavior to keep responses in Mermaid by default, and only return Draw.io XML when the prompt explicitly requests conversion.
- Refactored viewer architecture into feature-focused modules under `scripts/core/viewer/` (`createDiagramViewer`, `renderEngine`, `panZoom`, `format`) and kept `scripts/core/viewer.js` as stable re-export.
- Refactored app startup/event orchestration out of `scripts/main.js` into `scripts/features/appLifecycle.js` and isolated source-format state logic in `scripts/features/sourceFormatController.js`.
- Updated sample button text from `Load Sample XML` to `Load Sample` (and corresponding Traditional Chinese text).
- Updated Versions cards layout to move mode and quick actions beneath the thumbnail, keeping metadata and restore action visually separated.
- Updated per-version mode badge text to compact labels (`DrawIO` / `Mermaid`) for faster scanning.
- Updated Versions card header layout so `Restore this version` is rendered on its own row.
- Removed the redundant top-level current-mode badge from the Versions tab to avoid duplicate mode indicators.

### Fixed

- Fixed selected version-card highlight clipping at the top/left edges of the scroll container by using an inset ring style.
- Fixed Mermaid preview failures for pasted Markdown fenced code blocks by normalizing Mermaid input before rendering.
- Fixed Mermaid `Syntax error in text` rendering cases by adding pre-render Mermaid parse validation and defensive error handling for error-markup SVG output.

## 0.0.1

### Added

- Initial single-page Draw.io XML viewer and live editor with split-pane layout.
- File import support for `.xml` and `.drawio` via drag-and-drop and local file picker.
- URL-based XML loading with inline status feedback.
- Built-in sample XML loading for quick demo and onboarding.
- Added external prompt configuration at `scripts/prompts/system_prompt_drawio.md` for easier AI system prompt editing.
- Added `.jshintrc` with ES module/browser settings to keep lint behavior consistent after script splitting.
- Added a dedicated Gemini settings modal with open/close controls and save actions.
- Added persistent Gemini settings storage in `localStorage` for API key and model name.
- Added browser-based i18n architecture with split translation dictionaries under `scripts/modules/i18n/`.
- Added PWA assets and configuration (`manifest.json`, `service-worker.js`, and favicon resources).
- Added Docker-based Playwright E2E testing scaffold (`e2e/`, `Dockerfile.test`, `docker-compose.yml`, `playwright.config.js`, and test scripts).
- Added GitHub Actions workflow to run Docker Compose E2E checks on pushes and pull requests.
- Added a three-tab left workspace (`Source`, `AI Editor`, and `Versions`) to simplify editing and version navigation.
- Added AI reference file attachments with multi-file upload/drag-drop support to provide extra context for prompt execution.
- Added AI version history with persisted prompt/result snapshots and one-click restore actions.
- Added preview-area region selection with a translucent selection box and crop capture workflow.
- Added selected-region image preview in the AI panel and included that image in Gemini requests as multimodal context.
- Added `Ctrl + Enter` submit shortcut inside the AI prompt textarea.
- Added quick prompt links (`Org Chart` and `Adjust Colors`) beside the AI prompt label to instantly load example prompt text.
- Added a one-click `Clear` action on the AI prompt header to reset current prompt input.
- Added an interactive preview minimap with viewport indicator, click-to-navigate, and drag-to-pan behavior.
- Added a dedicated `Clear All` highlight action button in the preview toolbar.
- Added a keyboard shortcuts help modal, including a top-right launcher button and `?` quick-open shortcut.
- Added global keyboard shortcuts for preview control and highlighting (`+`, `-`, `/`, `I`, `D`, `E`) plus `Ctrl/Cmd + S` to download XML directly.
- Added a full-screen AI loading overlay while Gemini generation is in progress to provide clear global busy feedback.
- Added per-version `Copy` and `Download` actions in the Versions panel, including persisted per-entry export file names.
- Added version thumbnails in history cards with a left-side square preview layout and keyboard-selected version highlighting.
- Added keyboard workflows for version navigation: `V` to switch to Versions, then `PageUp/PageDown` to restore adjacent versions.
- Added extra productivity shortcuts: `Tab` to focus the AI prompt and `M` to toggle the minimap.
- Added persistence for highlight mode selection (`rect` / `polygon` / `freehand`) in `localStorage`.
- Added an `X` keyboard shortcut to jump to the `Source` tab and auto-select all XML for faster replacement/edit workflows.
- Added a dedicated `Clear` button beside `Rerender` in the XML editor header to reset source content in one click.

### Changed

- Added debounced live preview rendering to reduce excessive redraws during typing.
- Added manual re-render control for explicit XML refresh.
- Refactored inline JavaScript and CSS out of `index.html` into modular files under `scripts/` and `styles/`.
- Reorganized client logic by responsibility (`core`, `services`, `ui`, `utils`) to improve readability and maintenance.
- Reordered the left panel so the XML editor appears first and Gemini controls are shown in the lower section.
- Replaced the model dropdown with a free-text model input and defaulted it to `gemini-flash-latest`.
- Moved the built-in sample diagram XML into a dedicated `example.drawio` file and loaded it dynamically.
- Updated startup behavior to restore the last saved diagram from `localStorage`, falling back to `example.drawio` when no user default exists.
- Updated UI copy, placeholders, and runtime toast messages to switch immediately with the selected language.
- Updated favicon references across HTML metadata, manifest icons, and service-worker cache entries to use `assets/favicon/favicon.png`.
- Updated preview interactions to support wheel zoom and left-drag pan across the entire right-side preview area, not only on diagram shapes.
- Updated the Draw.io viewer configuration to disable lightbox behavior so clicking the preview no longer opens a modal.
- Updated the left navigation tab label from `Editor/Preview` to `Source` (and `原始碼` for `zh-TW`) for clearer intent.
- Moved AI version history out of the AI editor panel into a dedicated `Versions` tab for cleaner task focus.
- Updated preview interaction handling so pan/zoom is temporarily disabled while region-selection mode is active.
- Replaced the AI section icon from a currency-style symbol to a pen-style edit icon for better semantic consistency.
- Moved the `Ask AI to Generate/Modify` button to a sticky bottom position in the AI panel for more consistent access while scrolling.
- Removed the unused `assets/favicon/favicon.svg` asset after standardizing favicon usage on `assets/favicon/favicon.png`.
- Updated AI apply flow to clear existing highlights immediately after successful XML generation to avoid stale selection overlays.
- Updated preview reset behavior so `/` now restores a centered zoom-to-fit view.
- Updated top-right preview controls by replacing the passive pan/zoom hint chip with an actionable shortcuts entry point.
- Updated left-panel scrolling behavior so tab buttons remain visible while the `Versions` tab content scrolls independently.
- Updated AI prompt handling to persist draft text in `localStorage`, restore it on reload, and clear it only after successful AI submission.
- Refactored `scripts/main.js` by extracting business-specific responsibilities into dedicated feature modules (`fileNameManager`, UI state, Gemini settings, shortcuts, shared app event bindings, and AI event bindings), keeping `main.js` focused on composition and startup orchestration.
- Updated AI panel layout ordering to show `Highlighted Snapshot` above `Reference Files` for faster visual confirmation after selection.
- Updated button labels to expose keyboard hints directly in the main UI (for example `(I)`, `(D)`, `(E)`, `(Ctrl+S)`, and `(?)`).
- Updated toast visibility behavior so hidden toasts do not block interactions with underlying preview controls.
- Updated preview interaction rules so pan/zoom and minimap navigation are locked while highlights exist, preventing selection drift after capture.
- Refactored history thumbnail capture logic from `main.js` into `scripts/features/historyThumbnailCapture.js` to keep bootstrap logic leaner.
- Updated left-tab labels to expose direct keyboard hints (`Source (X)`, `AI Editor (Tab)`, and `Versions (V)`).

### Documentation

- Rewrote `README.md` to a structured, implementation-aligned English guide covering features, stack, setup, usage flow, storage behavior, and runtime notes.
- Added `README_zh_tw.md` as the synchronized Traditional Chinese counterpart with matching section structure and bilingual cross-links.

### Improved

- Enhanced UI feedback with toast notifications and loading states for user actions.
- Added zoom/pan enabled Draw.io viewer toolbar for easier diagram inspection.
- Improved installation readiness for mobile/desktop browsers with full PWA meta/link tags.
- Improved preview centering so rendered diagrams initialize at the center of the preview pane and stay centered before user interaction.

### Fixed

- Added AI response cleanup to strip markdown code fences before rendering returned XML.
- Added retry logic for Gemini API requests to reduce transient network or rate-limit failures.
- Fixed AI error handling when non-JSON error responses are returned by the API.
- Fixed XML draft persistence timing by saving editor content to `localStorage` on every input and again before page unload.
- Fixed Docker-based Playwright module resolution by linking `/app/node_modules` to `/deps/node_modules`, preventing `ERR_MODULE_NOT_FOUND` for `@playwright/test` in ESM config/spec imports.
- Fixed the i18n persistence E2E scenario by replacing `page.addInitScript` with one-time `localStorage` setup before reload, so language state assertions no longer reset to `en` on every navigation.
- Fixed accidental text selection in the preview pane by disabling text selection styles during drag/pan interactions.
- Fixed stale frontend assets after updates by switching same-origin service-worker fetch handling to network-first with cache fallback and a controller-change reload path.
- Fixed Gemini multimodal request failures for highlighted-region snapshots by converting SVG-based captures to PNG before upload (`image/svg+xml` is not accepted).
- Fixed minimap intermittently rendering blank by observing in-place SVG mutations and refreshing the minimap clone when diagram content updates.
- Fixed history entry downloads to use the file name captured at the time each version was created, instead of only the current working name.
- Fixed version-card action discoverability by switching restore/copy/download controls from link-like text to explicit button styling.
- Fixed highlighted snapshot export regressions through multiple capture-path adjustments (viewer/container raster capture precedence, minimap exclusion, and SVG-coordinate remapping) to improve full-diagram coverage and highlight alignment.
- Fixed version restore behavior to keep the `Versions` tab active after applying a historical snapshot.
- Fixed the minimap E2E transform assertion to also detect transforms applied directly on the diagram host element, preventing false failures when no transformed child node exists.
- Fixed the keyboard-highlight E2E reset assertion to verify the selection-mode class (`ring-emerald-400`) instead of the static focus utility class (`focus:ring-2`), eliminating false negatives after pressing `E`.
