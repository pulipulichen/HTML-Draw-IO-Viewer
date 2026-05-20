import { ENV_API_KEY } from "./constants.js";
import { createDiagramViewer } from "./core/viewer.js";
import { createAiHistoryController } from "./features/aiHistoryController.js";
import { createReferenceFilesController } from "./features/referenceFilesController.js";
import { createSelectionController } from "./features/selectionController.js";
import { initializeI18n, onLanguageChange, t } from "./modules/i18n.js";
import { registerServiceWorker } from "./pwa/registerServiceWorker.js";
import { requestAiXml } from "./services/aiService.js";
import { isSupportedDiagramFile, readTextFile } from "./services/fileService.js";
import { fetchXmlFromUrl } from "./services/networkService.js";
import { createToastController } from "./ui/toast.js";
import { debounce } from "./utils/debounce.js";
import { getDomElements } from "./utils/dom.js";
import { readStoredJson, readStoredValue, writeStoredValue } from "./utils/storage.js";

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
const DEFAULT_DIAGRAM_FILE_NAME = "diagram.drawio";
const DRAWIO_EDITOR_URL = "https://app.diagrams.net/?splash=0";

let isFetchLoading = false;
let isAiLoading = false;
let activeTab = "editor";
let sourceFileName = DEFAULT_DIAGRAM_FILE_NAME;
let aiEditedAt = null;

function sanitizeFileName(fileName) {
    const normalized = String(fileName || "").trim() || DEFAULT_DIAGRAM_FILE_NAME;
    return normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function splitFileName(fileName) {
    const safeFileName = sanitizeFileName(fileName);
    const dotIndex = safeFileName.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === safeFileName.length - 1) {
        return { baseName: safeFileName, extension: ".drawio" };
    }
    return {
        baseName: safeFileName.slice(0, dotIndex),
        extension: safeFileName.slice(dotIndex)
    };
}

function formatTimestampForFilename(timestampValue) {
    const date = new Date(timestampValue);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function getEffectiveExportFileName() {
    const { baseName, extension } = splitFileName(sourceFileName);
    if (!aiEditedAt) {
        return `${baseName}${extension}`;
    }
    return `${baseName}-${formatTimestampForFilename(aiEditedAt)}${extension}`;
}

function updateCurrentFileNameInput() {
    if (document.activeElement === dom.currentFileNameInput) {
        return;
    }
    dom.currentFileNameInput.value = sourceFileName;
}

function setSourceFileName(nextFileName, options = {}) {
    const { preserveAiEditFlag = false } = options;
    sourceFileName = sanitizeFileName(nextFileName);
    if (!preserveAiEditFlag) {
        aiEditedAt = null;
    }
    updateCurrentFileNameInput();
}

function markAiEdited(timestampValue = new Date().toISOString()) {
    aiEditedAt = timestampValue;
    updateCurrentFileNameInput();
}

function inferFileNameFromUrl(urlText) {
    try {
        const url = new URL(urlText);
        const nameFromQuery =
            url.searchParams.get("filename") ||
            url.searchParams.get("file") ||
            url.searchParams.get("name");
        if (nameFromQuery) {
            return sanitizeFileName(nameFromQuery);
        }

        const lastSegment = decodeURIComponent(url.pathname.split("/").pop() || "").trim();
        if (lastSegment) {
            if (/\.(xml|drawio)$/i.test(lastSegment)) {
                return sanitizeFileName(lastSegment);
            }
            return sanitizeFileName(`${lastSegment}.drawio`);
        }
    } catch (_error) {
        // ignore URL parse failure and fallback to default
    }

    return DEFAULT_DIAGRAM_FILE_NAME;
}

function triggerXmlDownload(xmlText, fileName) {
    const blob = new Blob([xmlText], { type: "application/xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
}

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

const selectionController = createSelectionController({
    dom,
    t,
    showToast: (message, isError = false) => toast.show(message, isError),
    onSelectionCaptured: () => setActiveTab("ai")
});

const referenceFilesController = createReferenceFilesController({
    dom,
    t,
    readTextFile,
    showToast: (message, isError = false) => toast.show(message, isError)
});

const aiHistoryController = createAiHistoryController({
    dom,
    t,
    readStoredJson,
    writeStoredValue,
    storageKey: STORAGE_KEYS.aiHistory,
    showToast: (message, isError = false) => toast.show(message, isError),
    onRestore: (entry) => {
        fillXmlAndRender(entry.resultXml);
        markAiEdited(entry.timestamp);
        setActiveTab("editor");
    }
});

function fillXmlAndRender(xmlText, options = {}) {
    const { persist = true, clearSelection = true } = options;
    dom.xmlInput.value = xmlText;
    if (clearSelection) {
        selectionController.clearSelectedRegion();
        selectionController.setSelectionMode(false);
    }
    render(xmlText);

    if (persist) {
        writeStoredValue(STORAGE_KEYS.diagramXml, xmlText);
    }
}

async function loadExampleXml() {
    const response = await window.fetch(EXAMPLE_DRAWIO_PATH, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`範例檔案載入失敗 (${response.status})`);
    }
    return response.text();
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

async function handleFile(file) {
    if (!isSupportedDiagramFile(file.name)) {
        toast.show(t("toast.unsupportedFile"), true);
        return;
    }

    try {
        const text = await readTextFile(file);
        fillXmlAndRender(text);
        setSourceFileName(file.name);
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
        if (dom.loadingState) {
            dom.loadingState.style.display = "flex";
            const loadingLabel = dom.loadingState.querySelector("[data-i18n='viewer.loading']");
            if (loadingLabel instanceof HTMLElement) {
                loadingLabel.textContent = t("toast.resettingDiagram");
            } else {
                dom.loadingState.textContent = t("toast.resettingDiagram");
            }
        }

        window.setTimeout(async () => {
            try {
                const exampleXml = await loadExampleXml();
                fillXmlAndRender(exampleXml);
                setSourceFileName("example.drawio");
                toast.show(t("toast.sampleLoaded"));
            } catch (_error) {
                toast.show(t("toast.sampleLoadFailed"), true);
            } finally {
                if (dom.loadingState) {
                    dom.loadingState.style.display = "none";
                }
            }
        }, 150);
    });
}

function registerTabEvents() {
    dom.editorTabBtn.addEventListener("click", () => setActiveTab("editor"));
    dom.aiTabBtn.addEventListener("click", () => setActiveTab("ai"));
    dom.versionsTabBtn.addEventListener("click", () => setActiveTab("versions"));
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
            setSourceFileName(inferFileNameFromUrl(url));
            toast.show(t("toast.urlLoadSuccess"));
        } catch (_error) {
            toast.show(t("toast.urlLoadFailed"), true);
        } finally {
            setFetchLoading(false);
        }
    });
}

function registerExportEvents() {
    dom.downloadXmlBtn.addEventListener("click", () => {
        const xmlText = dom.xmlInput.value.trim();
        if (!xmlText) {
            toast.show(t("toast.noXmlToDownload"), true);
            return;
        }

        triggerXmlDownload(xmlText, getEffectiveExportFileName());
        toast.show(t("toast.downloadStarted"));
    });

    dom.openInDrawioBtn.addEventListener("click", () => {
        const xmlText = dom.xmlInput.value.trim();
        if (!xmlText) {
            toast.show(t("toast.noXmlToDownload"), true);
            return;
        }

        const exportFileName = getEffectiveExportFileName();
        try {
            const xmlDataUrl = `data:text/xml;charset=utf-8,${encodeURIComponent(xmlText)}`;
            const drawioUrl =
                `${DRAWIO_EDITOR_URL}&title=${encodeURIComponent(exportFileName)}` +
                `&url=${encodeURIComponent(xmlDataUrl)}`;

            if (drawioUrl.length > 180000) {
                throw new Error("xml too large for drawio url");
            }

            const popup = window.open(drawioUrl, "_blank", "noopener,noreferrer");
            if (!popup) {
                throw new Error("popup blocked");
            }
            toast.show(t("toast.openedCurrentInDrawio"));
        } catch (error) {
            triggerXmlDownload(xmlText, exportFileName);
            window.open(DRAWIO_EDITOR_URL, "_blank", "noopener,noreferrer");
            if (error instanceof Error && error.message === "xml too large for drawio url") {
                toast.show(t("toast.currentXmlTooLargeForDrawioUrl"), true);
                return;
            }
            toast.show(t("toast.failedOpenDrawioWithXml"), true);
        }
    });

    dom.openDrawioLink.addEventListener("click", () => {
        toast.show(t("toast.openedDrawio"));
    });
}

function registerFileNameEvents() {
    const applyCurrentFileNameInput = () => {
        setSourceFileName(dom.currentFileNameInput.value, { preserveAiEditFlag: true });
    };

    dom.currentFileNameInput.addEventListener("change", applyCurrentFileNameInput);
    dom.currentFileNameInput.addEventListener("blur", applyCurrentFileNameInput);
    dom.currentFileNameInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
            return;
        }
        event.preventDefault();
        applyCurrentFileNameInput();
        dom.currentFileNameInput.blur();
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

function registerAiEvents() {
    dom.aiTabPanel.addEventListener("click", (event) => {
        let target = null;
        if (event.target instanceof Element) {
            target = event.target.closest("button[data-prompt-key], button[data-action=\"clearPrompt\"]");
        }
        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (target.dataset.action === "clearPrompt") {
            dom.aiPrompt.value = "";
            dom.aiPrompt.focus();
            return;
        }

        const promptKey = target.dataset.promptKey;
        if (!promptKey) {
            return;
        }

        dom.aiPrompt.value = t(promptKey);
        dom.aiPrompt.focus();
        const cursorPos = dom.aiPrompt.value.length;
        dom.aiPrompt.setSelectionRange(cursorPos, cursorPos);
    });

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
            const usedSelectedRegionImage = selectionController.getSelectedRegionImage();
            const referenceFiles = referenceFilesController.getFiles();
            const resultXml = await requestAiXml({
                prompt,
                currentXml,
                apiKey,
                model,
                referenceFiles,
                selectedRegionImage: usedSelectedRegionImage
            });

            fillXmlAndRender(resultXml, { clearSelection: false });
            markAiEdited();
            aiHistoryController.addEntry({
                prompt,
                resultXml,
                referenceFiles,
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
    referenceFilesController.initialize();
    aiHistoryController.initialize();
    selectionController.initialize();
    setActiveTab(readStoredValue(STORAGE_KEYS.leftPanelTab), { persist: false });

    const storedXml = readStoredValue(STORAGE_KEYS.diagramXml).trim();
    if (storedXml) {
        fillXmlAndRender(storedXml, { persist: false });
    } else {
        try {
            const exampleXml = await loadExampleXml();
            fillXmlAndRender(exampleXml);
            setSourceFileName("example.drawio");
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
    registerUrlEvents();
    registerFileEvents();
    registerExportEvents();
    registerFileNameEvents();
    registerAiEvents();
    registerGeminiSettingsEvents();

    onLanguageChange(() => {
        setFetchLoading(isFetchLoading);
        setAiLoading(isAiLoading);
        referenceFilesController.refreshTexts();
        aiHistoryController.refreshTexts();
        selectionController.refreshTexts();
        updateCurrentFileNameInput();
        if (!dom.xmlInput.value.trim()) {
            render("");
        }
    });
}

window.addEventListener("load", initialize);
