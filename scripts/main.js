import {
    DEFAULT_DIAGRAM_FILE_NAME,
    DEFAULT_MODEL_NAME,
    DRAWIO_EDITOR_URL,
    ENV_API_KEY,
    EXAMPLE_DRAWIO_PATH,
    EXAMPLE_MERMAID_PATH,
    STORAGE_KEYS
} from "./constants.js";
import { createDiagramViewer } from "./core/viewer.js";
import { createAiHistoryController } from "./features/aiHistoryController.js";
import { initializeApp, registerAppEvents } from "./features/appLifecycle.js";
import { createFileNameManager } from "./features/fileNameManager.js";
import { createGeminiSettingsController } from "./features/geminiSettingsController.js";
import { createHistoryThumbnailCapture } from "./features/historyThumbnailCapture.js";
import { createReferenceFilesController } from "./features/referenceFilesController.js";
import { createSelectionController } from "./features/selectionController.js";
import { createShortcutsController } from "./features/shortcutsController.js";
import { createSourceFormatController } from "./features/sourceFormatController.js";
import { createUiStateController } from "./features/uiStateController.js";
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

const fileNameManager = createFileNameManager({
    defaultFileName: DEFAULT_DIAGRAM_FILE_NAME,
    fileNameInput: dom.currentFileNameInput
});

const uiStateController = createUiStateController({
    dom,
    t,
    writeStoredValue,
    storageKeys: STORAGE_KEYS
});

let shortcutsController = null;
const geminiSettingsController = createGeminiSettingsController({
    dom,
    t,
    toast,
    readStoredValue,
    writeStoredValue,
    storageKeys: STORAGE_KEYS,
    defaultModelName: DEFAULT_MODEL_NAME
});

const sourceFormatController = createSourceFormatController({
    dom,
    viewer,
    writeStoredValue,
    storageKeys: STORAGE_KEYS,
    t
});
const { render, setSourceFormatHint } = sourceFormatController;

const selectionController = createSelectionController({
    dom,
    t,
    showToast: (message, isError) => toast.show(message, Boolean(isError)),
    onSelectionCaptured: () => uiStateController.setActiveTab("ai"),
    readStoredValue,
    writeStoredValue,
    highlightModeStorageKey: STORAGE_KEYS.highlightMode
});

function fillXmlAndRender(xmlText, options = {}) {
    const { persist = true, clearSelection = true, sourceFormatHint = null } = options;
    dom.xmlInput.value = xmlText;
    if (sourceFormatHint) {
        setSourceFormatHint(sourceFormatHint, { persist });
    }
    if (clearSelection) {
        selectionController.clearSelectedRegion();
        selectionController.setSelectionMode(false);
    }
    render(xmlText);
    if (persist) {
        writeStoredValue(STORAGE_KEYS.diagramXml, xmlText);
    }
}

const captureHistoryThumbnail = createHistoryThumbnailCapture({
    viewerContainer: dom.viewerContainer
});

const referenceFilesController = createReferenceFilesController({
    dom,
    t,
    readTextFile,
    showToast: (message, isError) => toast.show(message, Boolean(isError))
});

const aiHistoryController = createAiHistoryController({
    dom,
    t,
    readStoredJson,
    writeStoredValue,
    storageKey: STORAGE_KEYS.aiHistory,
    showToast: (message, isError) => toast.show(message, Boolean(isError)),
    onRestore: (entry) => {
        fillXmlAndRender(entry.resultXml);
        fileNameManager.markAiEdited(entry.timestamp);
        uiStateController.setActiveTab("versions");
    }
});

shortcutsController = createShortcutsController({
    dom,
    viewer,
    aiHistoryController
});

function registerEvents() {
    registerAppEvents({
        dom,
        writeStoredValue,
        storageKeys: STORAGE_KEYS,
        debounce,
        render,
        toast,
        t,
        loadExampleXml,
        fillXmlAndRender,
        fileNameManager,
        setSourceFormatHint,
        captureHistoryThumbnail,
        aiHistoryController,
        uiStateController,
        fetchXmlFromUrl,
        isSupportedDiagramFile,
        readTextFile,
        drawioEditorUrl: DRAWIO_EDITOR_URL,
        envApiKey: ENV_API_KEY,
        defaultModelName: DEFAULT_MODEL_NAME,
        requestAiXml,
        selectionController,
        referenceFilesController,
        geminiSettingsController,
        shortcutsController,
        getCurrentSourceFormat: sourceFormatController.getCurrentSourceFormat
    });
}

async function loadExampleXml(format = "drawio") {
    const useMermaid = format === "mermaid";
    const examplePath = useMermaid ? EXAMPLE_MERMAID_PATH : EXAMPLE_DRAWIO_PATH;
    const response = await window.fetch(examplePath, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`範例檔案載入失敗 (${response.status})`);
    }
    const content = await response.text();
    return {
        content,
        sourceFormatHint: useMermaid ? "mermaid" : "drawio",
        fileName: useMermaid ? "example.mmd" : "example.drawio"
    };
}

function refreshI18nDrivenUi() {
    uiStateController.setFetchLoading(uiStateController.getIsFetchLoading());
    uiStateController.setAiLoading(uiStateController.getIsAiLoading());
    referenceFilesController.refreshTexts();
    aiHistoryController.refreshTexts();
    selectionController.refreshTexts();
    viewer.minimap.refreshTexts();
    fileNameManager.updateCurrentFileNameInput();
    sourceFormatController.updateMermaidConvertButtonVisibility();
    sourceFormatController.refreshCurrentModeBadge();
    if (!dom.xmlInput.value.trim()) {
        render("");
    }
}

async function initialize() {
    await initializeApp({
        dom,
        uiStateController,
        geminiSettingsController,
        referenceFilesController,
        aiHistoryController,
        selectionController,
        readStoredValue,
        storageKeys: STORAGE_KEYS,
        fillXmlAndRender,
        loadExampleXml,
        fileNameManager,
        toast,
        t,
        render,
        setSourceFormatHint,
        registerEvents,
        refreshI18nDrivenUi,
        onLanguageChange
    });
}

window.addEventListener("load", initialize);
