import { ENV_API_KEY } from "./constants.js";
import { createDiagramViewer } from "./core/viewer.js";
import { initializeI18n, onLanguageChange, t } from "./modules/i18n.js";
import { registerServiceWorker } from "./pwa/registerServiceWorker.js";
import { requestAiXml } from "./services/aiService.js";
import { isSupportedDiagramFile, readTextFile } from "./services/fileService.js";
import { fetchXmlFromUrl } from "./services/networkService.js";
import { createToastController } from "./ui/toast.js";
import { debounce } from "./utils/debounce.js";
import { getDomElements } from "./utils/dom.js";

const dom = getDomElements();
registerServiceWorker();
initializeI18n({ languageSelect: dom.languageSelect });
const toast = createToastController(dom.toast);
const viewer = createDiagramViewer(dom.viewerContainer, (message) => toast.show(message, true), t);
const STORAGE_KEYS = {
    apiKey: "drawio-viewer-gemini-api-key",
    model: "drawio-viewer-gemini-model",
    diagramXml: "drawio-viewer-diagram-xml",
    aiHistory: "drawio-viewer-ai-history",
    leftPanelTab: "drawio-viewer-left-panel-tab"
};
const DEFAULT_MODEL_NAME = "gemini-flash-latest";
const EXAMPLE_DRAWIO_PATH = "./example.drawio";
const MAX_AI_HISTORY = 20;
const MAX_REFERENCE_TEXT_LENGTH = 15000;
const MIN_SELECTION_SIZE = 12;
let isFetchLoading = false;
let isAiLoading = false;
let activeTab = "editor";
let aiReferenceFiles = [];
let aiHistory = [];
let isSelectionMode = false;
let isDrawingSelection = false;
let selectionStart = null;
let selectedRegionImage = null;

function render(xml) {
    viewer.render(xml);
}

function setFetchLoading(isLoading) {
    isFetchLoading = isLoading;
    dom.fetchBtn.disabled = isLoading;
    dom.fetchBtn.textContent = isLoading ? t("import.loadingBtn") : t("import.loadBtn");
}

function setAiLoading(isLoading) {
    isAiLoading = isLoading;
    dom.askAiBtn.disabled = isLoading;
    dom.askAiBtnText.textContent = isLoading ? t("ai.askBtnLoading") : t("ai.askBtnIdle");
    dom.aiSpinner.classList.toggle("hidden", !isLoading);
    dom.askAiBtn.classList.toggle("opacity-75", isLoading);
    dom.askAiBtn.classList.toggle("cursor-not-allowed", isLoading);
}

function fillXmlAndRender(xmlText, options = {}) {
    const { persist = true, clearSelection = true } = options;
    dom.xmlInput.value = xmlText;
    if (clearSelection) {
        clearSelectedRegion();
        setSelectionMode(false);
    }
    render(xmlText);

    if (persist) {
        writeStoredValue(STORAGE_KEYS.diagramXml, xmlText);
    }
}

function readStoredJson(key, fallbackValue) {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return fallbackValue;
        }
        return JSON.parse(raw);
    } catch (_error) {
        return fallbackValue;
    }
}

async function loadExampleXml() {
    const response = await window.fetch(EXAMPLE_DRAWIO_PATH, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`範例檔案載入失敗 (${response.status})`);
    }

    return response.text();
}

function readStoredValue(key) {
    try {
        return window.localStorage.getItem(key) || "";
    } catch (_error) {
        return "";
    }
}

function writeStoredValue(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (_error) {
        // ignore localStorage write failures (private mode/quota issues)
    }
}

function openGeminiSettingsModal() {
    dom.geminiSettingsModal.classList.remove("hidden");
    dom.geminiSettingsModal.classList.add("flex");
}

function closeGeminiSettingsModal() {
    dom.geminiSettingsModal.classList.add("hidden");
    dom.geminiSettingsModal.classList.remove("flex");
}

function persistGeminiSettings() {
    const apiKey = dom.apiKeyInput.value.trim();
    const model = dom.modelInput.value.trim() || DEFAULT_MODEL_NAME;
    dom.modelInput.value = model;
    writeStoredValue(STORAGE_KEYS.apiKey, apiKey);
    writeStoredValue(STORAGE_KEYS.model, model);
}

function initializeGeminiSettings() {
    const savedApiKey = readStoredValue(STORAGE_KEYS.apiKey);
    const savedModel = readStoredValue(STORAGE_KEYS.model);
    dom.apiKeyInput.value = savedApiKey;
    dom.modelInput.value = savedModel || DEFAULT_MODEL_NAME;
}

function normalizeTab(value) {
    if (value === "ai" || value === "versions") {
        return value;
    }
    return "editor";
}

function setActiveTab(nextTab, options = {}) {
    const { persist = true } = options;
    activeTab = normalizeTab(nextTab);

    dom.editorTabBtn.classList.toggle("active", activeTab === "editor");
    dom.aiTabBtn.classList.toggle("active", activeTab === "ai");
    dom.versionsTabBtn.classList.toggle("active", activeTab === "versions");
    dom.editorTabPanel.classList.toggle("hidden", activeTab !== "editor");
    dom.aiTabPanel.classList.toggle("hidden", activeTab !== "ai");
    dom.versionsTabPanel.classList.toggle("hidden", activeTab !== "versions");

    if (persist) {
        writeStoredValue(STORAGE_KEYS.leftPanelTab, activeTab);
    }
}

function setSelectionButtonsState() {
    dom.startSelectionBtn.classList.toggle("bg-blue-600", !isSelectionMode);
    dom.startSelectionBtn.classList.toggle("hover:bg-blue-700", !isSelectionMode);
    dom.startSelectionBtn.classList.toggle("bg-emerald-600", isSelectionMode);
    dom.startSelectionBtn.classList.toggle("hover:bg-emerald-700", isSelectionMode);
    if (isSelectionMode) {
        dom.startSelectionBtn.textContent = t("viewer.selectionModeActive");
    } else {
        dom.startSelectionBtn.textContent = t("viewer.startSelectionBtn");
    }

    dom.cancelSelectionBtn.disabled = !selectedRegionImage && !isSelectionMode;
    dom.cancelSelectionBtn.classList.toggle("opacity-50", dom.cancelSelectionBtn.disabled);
    dom.cancelSelectionBtn.classList.toggle("cursor-not-allowed", dom.cancelSelectionBtn.disabled);
}

function renderSelectedRegionPreview() {
    const hasImage = Boolean(selectedRegionImage);
    dom.selectedRegionEmpty.classList.toggle("hidden", hasImage);
    dom.selectedRegionPreviewWrap.classList.toggle("hidden", !hasImage);

    if (!hasImage) {
        dom.selectedRegionPreview.removeAttribute("src");
        dom.selectedRegionMeta.textContent = "";
        setSelectionButtonsState();
        return;
    }

    dom.selectedRegionPreview.src = selectedRegionImage.dataUrl;
    dom.selectedRegionMeta.textContent = `${selectedRegionImage.width} x ${selectedRegionImage.height}px`;
    setSelectionButtonsState();
}

function clearSelectionBox() {
    dom.selectionBox.classList.add("hidden");
    dom.selectionBox.style.width = "0px";
    dom.selectionBox.style.height = "0px";
}

function setSelectionMode(enabled) {
    isSelectionMode = enabled;
    dom.viewerContainer.dataset.interactionMode = enabled ? "select" : "pan";
    dom.viewerContainer.style.cursor = enabled ? "crosshair" : "";
    if (!enabled) {
        isDrawingSelection = false;
        selectionStart = null;
        clearSelectionBox();
    }
    setSelectionButtonsState();
}

function clearSelectedRegion() {
    selectedRegionImage = null;
    clearSelectionBox();
    renderSelectedRegionPreview();
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}\n...[truncated]`;
}

function formatTimestamp(timestamp) {
    try {
        return new Date(timestamp).toLocaleString();
    } catch (_error) {
        return timestamp;
    }
}

function sanitizeReferenceContent(content) {
    const trimmed = String(content || "").trim();
    if (!trimmed) {
        return "";
    }
    return truncateText(trimmed, MAX_REFERENCE_TEXT_LENGTH);
}

function renderReferenceFiles() {
    dom.referenceFilesList.innerHTML = "";

    if (!aiReferenceFiles.length) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "text-xs text-indigo-700/70";
        emptyItem.textContent = t("ai.noReferences");
        dom.referenceFilesList.appendChild(emptyItem);
        return;
    }

    aiReferenceFiles.forEach((file, index) => {
        const item = document.createElement("li");
        item.className = "flex items-center justify-between gap-2 bg-white border border-indigo-100 rounded px-2 py-1.5";

        const label = document.createElement("span");
        label.className = "truncate text-indigo-900";
        label.textContent = `${file.name} (${Math.round(file.content.length / 1024) || 1} KB)`;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "text-[11px] text-indigo-700 hover:text-indigo-900 font-medium";
        removeButton.dataset.index = String(index);
        removeButton.textContent = t("ai.removeReferenceBtn");

        item.appendChild(label);
        item.appendChild(removeButton);
        dom.referenceFilesList.appendChild(item);
    });
}

async function appendReferenceFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) {
        return;
    }

    const parsed = await Promise.all(
        files.map(async (file) => {
            const text = await readTextFile(file);
            const content = sanitizeReferenceContent(text);
            return {
                key: `${file.name}-${file.size}-${file.lastModified}`,
                name: file.name,
                content
            };
        })
    );

    const existingKeys = new Set(aiReferenceFiles.map((item) => item.key));
    parsed.forEach((item) => {
        if (item.content && !existingKeys.has(item.key)) {
            aiReferenceFiles.push(item);
        }
    });
    renderReferenceFiles();
}

function clearReferenceFiles() {
    aiReferenceFiles = [];
    renderReferenceFiles();
}

function normalizeSelectionRect(startPoint, endPoint, containerRect) {
    const left = Math.min(startPoint.x, endPoint.x);
    const top = Math.min(startPoint.y, endPoint.y);
    const right = Math.max(startPoint.x, endPoint.x);
    const bottom = Math.max(startPoint.y, endPoint.y);

    return {
        x: Math.max(0, Math.min(left, containerRect.width)),
        y: Math.max(0, Math.min(top, containerRect.height)),
        width: Math.max(0, Math.min(right, containerRect.width) - Math.max(0, Math.min(left, containerRect.width))),
        height: Math.max(0, Math.min(bottom, containerRect.height) - Math.max(0, Math.min(top, containerRect.height)))
    };
}

function updateSelectionBox(rect) {
    dom.selectionBox.classList.remove("hidden");
    dom.selectionBox.style.left = `${rect.x}px`;
    dom.selectionBox.style.top = `${rect.y}px`;
    dom.selectionBox.style.width = `${rect.width}px`;
    dom.selectionBox.style.height = `${rect.height}px`;
}

function getRenderedSvgElement() {
    return dom.viewerContainer.querySelector("svg");
}

function waitImageLoaded(image) {
    return new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("image load failed"));
    });
}

function getSvgSourceSize(svgElement) {
    const viewBox = svgElement.viewBox?.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        return { width: viewBox.width, height: viewBox.height };
    }

    const widthAttr = Number.parseFloat(svgElement.getAttribute("width") || "");
    const heightAttr = Number.parseFloat(svgElement.getAttribute("height") || "");
    if (widthAttr > 0 && heightAttr > 0) {
        return { width: widthAttr, height: heightAttr };
    }

    const bounds = svgElement.getBoundingClientRect();
    return {
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height))
    };
}

async function captureSelectionImage(selectionRect) {
    const svgElement = getRenderedSvgElement();
    if (!(svgElement instanceof SVGElement)) {
        throw new Error("no svg");
    }

    const svgRect = svgElement.getBoundingClientRect();
    if (!svgRect.width || !svgRect.height) {
        throw new Error("svg size invalid");
    }

    const containerRect = dom.viewerContainer.getBoundingClientRect();
    const selectionOnViewport = {
        left: containerRect.left + selectionRect.x,
        top: containerRect.top + selectionRect.y,
        right: containerRect.left + selectionRect.x + selectionRect.width,
        bottom: containerRect.top + selectionRect.y + selectionRect.height
    };

    const intersect = {
        left: Math.max(svgRect.left, selectionOnViewport.left),
        top: Math.max(svgRect.top, selectionOnViewport.top),
        right: Math.min(svgRect.right, selectionOnViewport.right),
        bottom: Math.min(svgRect.bottom, selectionOnViewport.bottom)
    };
    intersect.width = intersect.right - intersect.left;
    intersect.height = intersect.bottom - intersect.top;

    if (intersect.width < MIN_SELECTION_SIZE || intersect.height < MIN_SELECTION_SIZE) {
        throw new Error("selection too small");
    }

    const serializedSvg = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([serializedSvg], { type: "image/svg+xml;charset=utf-8" });
    const svgBlobUrl = URL.createObjectURL(svgBlob);

    try {
        const sourceSize = getSvgSourceSize(svgElement);
        const scaleX = sourceSize.width / svgRect.width;
        const scaleY = sourceSize.height / svgRect.height;

        const sourceX = Math.max(0, (intersect.left - svgRect.left) * scaleX);
        const sourceY = Math.max(0, (intersect.top - svgRect.top) * scaleY);
        const sourceWidth = Math.max(1, intersect.width * scaleX);
        const sourceHeight = Math.max(1, intersect.height * scaleY);

        const image = new Image();
        image.src = svgBlobUrl;
        await waitImageLoaded(image);

        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = Math.max(1, Math.round(sourceSize.width));
        fullCanvas.height = Math.max(1, Math.round(sourceSize.height));
        const fullCtx = fullCanvas.getContext("2d");
        if (!fullCtx) {
            throw new Error("canvas context unavailable");
        }
        fullCtx.drawImage(image, 0, 0, fullCanvas.width, fullCanvas.height);

        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = Math.max(1, Math.round(sourceWidth));
        cropCanvas.height = Math.max(1, Math.round(sourceHeight));
        const cropCtx = cropCanvas.getContext("2d");
        if (!cropCtx) {
            throw new Error("crop canvas context unavailable");
        }

        cropCtx.drawImage(
            fullCanvas,
            Math.round(sourceX),
            Math.round(sourceY),
            Math.round(sourceWidth),
            Math.round(sourceHeight),
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
        );

        return {
            mimeType: "image/png",
            dataUrl: cropCanvas.toDataURL("image/png"),
            width: cropCanvas.width,
            height: cropCanvas.height
        };
    } finally {
        URL.revokeObjectURL(svgBlobUrl);
    }
}

function readStoredAiHistory() {
    const list = readStoredJson(STORAGE_KEYS.aiHistory, []);
    if (!Array.isArray(list)) {
        return [];
    }
    return list.filter((item) => item && item.prompt && item.resultXml && item.timestamp);
}

function persistAiHistory() {
    writeStoredValue(STORAGE_KEYS.aiHistory, JSON.stringify(aiHistory));
}

function renderAiHistory() {
    dom.aiHistoryList.innerHTML = "";
    dom.aiHistoryEmpty.classList.toggle("hidden", aiHistory.length > 0);

    aiHistory.forEach((entry, index) => {
        const li = document.createElement("li");
        li.className = "border border-slate-200 rounded-md p-2 bg-slate-50";

        const topRow = document.createElement("div");
        topRow.className = "flex items-center justify-between gap-2";

        const meta = document.createElement("span");
        meta.className = "history-meta text-[11px] font-medium";
        meta.textContent = `${t("history.itemLabel")} #${aiHistory.length - index} · ${formatTimestamp(entry.timestamp)}`;

        const restoreButton = document.createElement("button");
        restoreButton.type = "button";
        restoreButton.dataset.restoreIndex = String(index);
        restoreButton.className = "text-xs text-blue-700 hover:text-blue-900 font-semibold";
        restoreButton.textContent = t("history.restoreBtn");

        topRow.appendChild(meta);
        topRow.appendChild(restoreButton);

        const promptLabel = document.createElement("div");
        promptLabel.className = "mt-1 text-[11px] font-semibold text-slate-600";
        promptLabel.textContent = t("history.promptLabel");

        const promptText = document.createElement("pre");
        promptText.className = "history-prompt text-[11px] leading-4 whitespace-pre-wrap break-words bg-white border border-slate-200 rounded p-2 max-h-20 overflow-y-auto";
        promptText.textContent = entry.prompt;

        const resultLabel = document.createElement("div");
        resultLabel.className = "mt-2 text-[11px] font-semibold text-slate-600";
        resultLabel.textContent = t("history.resultLabel");

        const resultText = document.createElement("pre");
        resultText.className = "text-[11px] leading-4 whitespace-pre-wrap break-words bg-white border border-slate-200 rounded p-2 max-h-28 overflow-y-auto";
        resultText.textContent = entry.resultXml;

        li.appendChild(topRow);
        li.appendChild(promptLabel);
        li.appendChild(promptText);
        li.appendChild(resultLabel);
        li.appendChild(resultText);
        dom.aiHistoryList.appendChild(li);
    });
}

function addAiHistoryEntry({ prompt, resultXml, referenceFiles, usedSelectedRegionImage }) {
    let referencesSummary = "";
    if (referenceFiles.length) {
        referencesSummary = `\n\n[${t("history.referencesSummary")}] ${referenceFiles.map((file) => file.name).join(", ")}`;
    }
    let selectedRegionSummary = "";
    if (usedSelectedRegionImage) {
        selectedRegionSummary = `\n[${t("history.selectedRegionSummary")}] ${usedSelectedRegionImage.width}x${usedSelectedRegionImage.height}px`;
    }

    const entry = {
        timestamp: new Date().toISOString(),
        prompt: `${prompt}${referencesSummary}${selectedRegionSummary}`,
        resultXml
    };

    aiHistory = [entry, ...aiHistory].slice(0, MAX_AI_HISTORY);
    persistAiHistory();
    renderAiHistory();
}

async function handleFile(file) {
    if (!isSupportedDiagramFile(file.name)) {
        toast.show(t("toast.unsupportedFile"), true);
        return;
    }

    try {
        const text = await readTextFile(file);
        fillXmlAndRender(text);
        toast.show(`${t("toast.fileLoaded")}: ${file.name}`);
    } catch (_error) {
        toast.show(t("toast.fileReadError"), true);
    }
}

function registerInputEvents() {
    dom.xmlInput.addEventListener("input", () => {
        writeStoredValue(STORAGE_KEYS.diagramXml, dom.xmlInput.value);
    });

    window.addEventListener("beforeunload", () => {
        writeStoredValue(STORAGE_KEYS.diagramXml, dom.xmlInput.value);
    });

    dom.xmlInput.addEventListener(
        "input",
        debounce(() => {
            render(dom.xmlInput.value);
        }, 600)
    );

    dom.formatBtn.addEventListener("click", () => {
        render(dom.xmlInput.value);
        toast.show(t("toast.rerendered"));
    });

    dom.loadSampleBtn.addEventListener("click", async () => {
        dom.viewerContainer.innerHTML =
            `<div class="absolute inset-0 flex items-center justify-center text-slate-400 font-medium">${t("toast.resettingDiagram")}</div>`;

        window.setTimeout(async () => {
            try {
                const exampleXml = await loadExampleXml();
                fillXmlAndRender(exampleXml);
                toast.show(t("toast.sampleLoaded"));
            } catch (_error) {
                toast.show(t("toast.sampleLoadFailed"), true);
            }
        }, 150);
    });
}

function registerTabEvents() {
    dom.editorTabBtn.addEventListener("click", () => setActiveTab("editor"));
    dom.aiTabBtn.addEventListener("click", () => setActiveTab("ai"));
    dom.versionsTabBtn.addEventListener("click", () => setActiveTab("versions"));
}

function registerViewerSelectionEvents() {
    dom.startSelectionBtn.addEventListener("click", () => {
        if (!dom.xmlInput.value.trim()) {
            toast.show(t("toast.noDiagramToSelect"), true);
            return;
        }
        setSelectionMode(!isSelectionMode);
    });

    dom.cancelSelectionBtn.addEventListener("click", () => {
        setSelectionMode(false);
        clearSelectedRegion();
    });

    dom.clearSelectedRegionBtn.addEventListener("click", () => {
        clearSelectedRegion();
        setSelectionMode(false);
    });

    dom.viewerContainer.addEventListener("pointerdown", (event) => {
        if (!isSelectionMode || event.button !== 0) {
            return;
        }

        const rect = dom.viewerContainer.getBoundingClientRect();
        isDrawingSelection = true;
        selectionStart = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        clearSelectionBox();
        event.preventDefault();
        event.stopPropagation();
    });

    dom.viewerContainer.addEventListener("pointermove", (event) => {
        if (!isSelectionMode || !isDrawingSelection || !selectionStart) {
            return;
        }

        const rect = dom.viewerContainer.getBoundingClientRect();
        const nextRect = normalizeSelectionRect(
            selectionStart,
            {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            },
            rect
        );
        updateSelectionBox(nextRect);
        event.preventDefault();
        event.stopPropagation();
    });

    window.addEventListener("pointerup", async (event) => {
        if (!isSelectionMode || !isDrawingSelection || !selectionStart || event.button !== 0) {
            return;
        }

        const rect = dom.viewerContainer.getBoundingClientRect();
        const finalRect = normalizeSelectionRect(
            selectionStart,
            {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            },
            rect
        );

        isDrawingSelection = false;
        selectionStart = null;

        if (finalRect.width < MIN_SELECTION_SIZE || finalRect.height < MIN_SELECTION_SIZE) {
            clearSelectionBox();
            toast.show(t("toast.selectionTooSmall"), true);
            return;
        }

        try {
            selectedRegionImage = await captureSelectionImage(finalRect);
            renderSelectedRegionPreview();
            setSelectionMode(false);
            setActiveTab("ai");
            toast.show(t("toast.selectionCaptured"));
        } catch (_error) {
            clearSelectionBox();
            toast.show(t("toast.selectionCaptureFailed"), true);
        }
    });
}

function registerUrlEvents() {
    dom.fetchBtn.addEventListener("click", async () => {
        const url = dom.urlInput.value.trim();
        if (!url) {
            toast.show(t("toast.urlRequired"), true);
            return;
        }

        setFetchLoading(true);
        try {
            const xmlText = await fetchXmlFromUrl(url);
            fillXmlAndRender(xmlText);
            toast.show(t("toast.urlLoadSuccess"));
        } catch (_error) {
            toast.show(t("toast.urlLoadFailed"), true);
        } finally {
            setFetchLoading(false);
        }
    });
}

function registerFileEvents() {
    dom.uploadBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        dom.fileInput.click();
    });

    dom.dropzone.addEventListener("click", () => dom.fileInput.click());

    dom.fileInput.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (file) {
            await handleFile(file);
        }
        event.target.value = "";
    });

    const preventDefaults = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, preventDefaults);
        document.body.addEventListener(eventName, preventDefaults);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, () => {
            dom.dropzone.classList.add("border-blue-500", "bg-blue-50");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, () => {
            dom.dropzone.classList.remove("border-blue-500", "bg-blue-50");
        });
    });

    dom.dropzone.addEventListener("drop", async (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            await handleFile(file);
        }
    });
}

function registerReferenceFileEvents() {
    dom.referenceUploadBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        dom.referenceFileInput.click();
    });

    dom.referenceDropzone.addEventListener("click", () => dom.referenceFileInput.click());

    dom.referenceFileInput.addEventListener("change", async (event) => {
        try {
            await appendReferenceFiles(event.target.files || []);
        } catch (_error) {
            toast.show(t("toast.referenceReadFailed"), true);
        } finally {
            event.target.value = "";
        }
    });

    const preventDefaults = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        dom.referenceDropzone.addEventListener(eventName, preventDefaults);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        dom.referenceDropzone.addEventListener(eventName, () => {
            dom.referenceDropzone.classList.add("bg-indigo-100/60");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dom.referenceDropzone.addEventListener(eventName, () => {
            dom.referenceDropzone.classList.remove("bg-indigo-100/60");
        });
    });

    dom.referenceDropzone.addEventListener("drop", async (event) => {
        const files = event.dataTransfer?.files || [];
        try {
            await appendReferenceFiles(files);
        } catch (_error) {
            toast.show(t("toast.referenceReadFailed"), true);
        }
    });

    dom.referenceFilesList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const index = Number(target.dataset.index);
        if (!Number.isFinite(index)) {
            return;
        }

        aiReferenceFiles.splice(index, 1);
        renderReferenceFiles();
    });

    dom.clearReferenceFilesBtn.addEventListener("click", () => {
        clearReferenceFiles();
    });
}

function registerAiHistoryEvents() {
    dom.aiHistoryList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const index = Number(target.dataset.restoreIndex);
        if (!Number.isFinite(index)) {
            return;
        }

        const targetEntry = aiHistory[index];
        if (!targetEntry) {
            return;
        }

        fillXmlAndRender(targetEntry.resultXml);
        setActiveTab("editor");
        toast.show(t("toast.historyRestored"));
    });

    dom.clearHistoryBtn.addEventListener("click", () => {
        aiHistory = [];
        persistAiHistory();
        renderAiHistory();
        toast.show(t("toast.historyCleared"));
    });
}

function registerAiEvents() {
    const submitAiPrompt = async () => {
        const prompt = dom.aiPrompt.value.trim();
        const currentXml = dom.xmlInput.value.trim();
        const apiKey = dom.apiKeyInput.value.trim() || ENV_API_KEY;
        const model = dom.modelInput.value.trim() || DEFAULT_MODEL_NAME;

        if (!prompt) {
            toast.show(t("toast.promptRequired"), true);
            dom.aiPrompt.focus();
            return;
        }

        if (!apiKey) {
            toast.show(t("toast.apiKeyRequired"), true);
            openGeminiSettingsModal();
            dom.apiKeyInput.focus();
            return;
        }

        dom.modelInput.value = model;
        persistGeminiSettings();

        setAiLoading(true);
        try {
            const usedSelectedRegionImage = selectedRegionImage;
            const resultXml = await requestAiXml({
                prompt,
                currentXml,
                apiKey,
                model,
                referenceFiles: aiReferenceFiles,
                selectedRegionImage: usedSelectedRegionImage
            });
            fillXmlAndRender(resultXml, { clearSelection: false });
            addAiHistoryEntry({
                prompt,
                resultXml,
                referenceFiles: aiReferenceFiles,
                usedSelectedRegionImage
            });
            dom.aiPrompt.value = "";
            toast.show(t("toast.aiUpdated"));
        } catch (error) {
            console.error("AI 請求失敗:", error);
            toast.show(`${t("toast.aiRequestFailed")}: ${error.message}`, true);
        } finally {
            setAiLoading(false);
        }
    };

    dom.askAiBtn.addEventListener("click", submitAiPrompt);

    dom.aiPrompt.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.ctrlKey) {
            event.preventDefault();
            submitAiPrompt();
        }
    });
}

function registerGeminiSettingsEvents() {
    dom.openGeminiSettingsBtn.addEventListener("click", () => {
        openGeminiSettingsModal();
    });

    dom.closeGeminiSettingsBtn.addEventListener("click", () => {
        closeGeminiSettingsModal();
    });

    dom.cancelGeminiSettingsBtn.addEventListener("click", () => {
        closeGeminiSettingsModal();
    });

    dom.geminiSettingsBackdrop.addEventListener("click", () => {
        closeGeminiSettingsModal();
    });

    dom.saveGeminiSettingsBtn.addEventListener("click", () => {
        persistGeminiSettings();
        closeGeminiSettingsModal();
        toast.show(t("toast.settingsSaved"));
    });

    dom.apiKeyInput.addEventListener("change", persistGeminiSettings);
    dom.modelInput.addEventListener("change", persistGeminiSettings);

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !dom.geminiSettingsModal.classList.contains("hidden")) {
            closeGeminiSettingsModal();
        }
    });
}

async function initialize() {
    setFetchLoading(false);
    setAiLoading(false);

    initializeGeminiSettings();
    aiHistory = readStoredAiHistory();
    renderAiHistory();
    renderReferenceFiles();
    renderSelectedRegionPreview();
    setSelectionMode(false);
    setActiveTab(readStoredValue(STORAGE_KEYS.leftPanelTab), { persist: false });

    const storedXml = readStoredValue(STORAGE_KEYS.diagramXml).trim();
    if (storedXml) {
        fillXmlAndRender(storedXml, { persist: false });
    } else {
        try {
            const exampleXml = await loadExampleXml();
            fillXmlAndRender(exampleXml);
        } catch (_error) {
            toast.show(t("toast.sampleLoadFailed"), true);
            render("");
        }
    }

    if (dom.loadingState) {
        dom.loadingState.style.display = "none";
    }

    registerInputEvents();
    registerTabEvents();
    registerViewerSelectionEvents();
    registerUrlEvents();
    registerFileEvents();
    registerReferenceFileEvents();
    registerAiEvents();
    registerAiHistoryEvents();
    registerGeminiSettingsEvents();

    onLanguageChange(() => {
        setFetchLoading(isFetchLoading);
        setAiLoading(isAiLoading);
        renderReferenceFiles();
        renderAiHistory();
        renderSelectedRegionPreview();
        if (!dom.xmlInput.value.trim()) {
            render("");
        }
    });
}

window.addEventListener("load", initialize);
