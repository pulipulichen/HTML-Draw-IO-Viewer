# Changelog

## 0.0.1

### Added

- Initial single-page Draw.io XML viewer and live editor with split-pane layout.
- File import support for `.xml` and `.drawio` via drag-and-drop and local file picker.
- URL-based XML loading with inline status feedback.
- Built-in sample XML loading for quick demo and onboarding.
- Added external prompt configuration at `scripts/prompts/system_prompt.md` for easier AI system prompt editing.
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
