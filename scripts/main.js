import {
    DEFAULT_DIAGRAM_FILE_NAME,
    DEFAULT_MODEL_NAME,
    DRAWIO_EDITOR_URL,
    ENV_API_KEY,
    EXAMPLE_DRAWIO_PATH,
    STORAGE_KEYS
} from "./constants.js";
import { createDiagramViewer } from "./core/viewer.js";
import { createAiHistoryController } from "./features/aiHistoryController.js";
import { registerAiEvents } from "./features/aiEventBindings.js";
import {
    registerExportEvents,
    registerFileEvents,
    registerFileNameEvents,
    registerInputEvents,
    registerTabEvents,
    registerUrlEvents
} from "./features/appEventBindings.js";
import { createFileNameManager } from "./features/fileNameManager.js";
import { createGeminiSettingsController } from "./features/geminiSettingsController.js";
import { createHistoryThumbnailCapture } from "./features/historyThumbnailCapture.js";
import { createReferenceFilesController } from "./features/referenceFilesController.js";
import { createSelectionController } from "./features/selectionController.js";
import { createShortcutsController } from "./features/shortcutsController.js";
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

const shortcutsController = createShortcutsController({ dom, viewer });
const geminiSettingsController = createGeminiSettingsController({
    dom,
    t,
    toast,
    readStoredValue,
    writeStoredValue,
    storageKeys: STORAGE_KEYS,
    defaultModelName: DEFAULT_MODEL_NAME
});

function render(xml) {
    viewer.render(xml);
}

const selectionController = createSelectionController({
    dom,
    t,
    showToast: (message, isError) => toast.show(message, Boolean(isError)),
    onSelectionCaptured: () => uiStateController.setActiveTab("ai")
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
        uiStateController.setActiveTab("editor");
    }
});

async function loadExampleXml() {
    const response = await window.fetch(EXAMPLE_DRAWIO_PATH, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`範例檔案載入失敗 (${response.status})`);
    }
    return response.text();
}

function registerAllEvents() {
    registerInputEvents({
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
        onSampleLoaded: async (xmlText) => {
            const thumbnailDataUrl = await captureHistoryThumbnail();
            aiHistoryController.addEntry({
                prompt: t("history.sampleLoadPrompt"),
                resultXml: xmlText,
                referenceFiles: [],
                usedSelectedRegionImage: null,
                fileName: fileNameManager.getEffectiveExportFileName(),
                thumbnailDataUrl
            });
        }
    });
    registerTabEvents({ dom, setActiveTab: uiStateController.setActiveTab });
    registerUrlEvents({
        dom,
        toast,
        t,
        fetchXmlFromUrl,
        fillXmlAndRender,
        fileNameManager,
        setFetchLoading: uiStateController.setFetchLoading
    });
    registerFileEvents({
        dom,
        toast,
        t,
        isSupportedDiagramFile,
        readTextFile,
        fillXmlAndRender,
        fileNameManager
    });
    registerExportEvents({
        dom,
        toast,
        t,
        drawioEditorUrl: DRAWIO_EDITOR_URL,
        fileNameManager
    });
    registerFileNameEvents({ dom, fileNameManager });
    registerAiEvents({
        dom,
        t,
        toast,
        writeStoredValue,
        storageKeys: STORAGE_KEYS,
        envApiKey: ENV_API_KEY,
        defaultModelName: DEFAULT_MODEL_NAME,
        requestAiXml,
        selectionController,
        referenceFilesController,
        aiHistoryController,
        fillXmlAndRender,
        fileNameManager,
        captureHistoryThumbnail,
        setAiLoading: uiStateController.setAiLoading,
        openGeminiSettingsModal: geminiSettingsController.openGeminiSettingsModal,
        persistGeminiSettings: geminiSettingsController.persistGeminiSettings
    });
    geminiSettingsController.registerGeminiSettingsEvents(shortcutsController);
    shortcutsController.registerShortcutsModalEvents();
    shortcutsController.registerKeyboardShortcuts();
}

function refreshI18nDrivenUi() {
    uiStateController.setFetchLoading(uiStateController.getIsFetchLoading());
    uiStateController.setAiLoading(uiStateController.getIsAiLoading());
    referenceFilesController.refreshTexts();
    aiHistoryController.refreshTexts();
    selectionController.refreshTexts();
    viewer.minimap.refreshTexts();
    fileNameManager.updateCurrentFileNameInput();
    if (!dom.xmlInput.value.trim()) {
        render("");
    }
}

async function initialize() {
    uiStateController.setFetchLoading(false);
    uiStateController.setAiLoading(false);

    geminiSettingsController.initializeGeminiSettings();
    referenceFilesController.initialize();
    aiHistoryController.initialize();
    selectionController.initialize();
    uiStateController.setActiveTab(readStoredValue(STORAGE_KEYS.leftPanelTab), { persist: false });

    const storedAiPrompt = readStoredValue(STORAGE_KEYS.aiPrompt);
    if (storedAiPrompt) {
        dom.aiPrompt.value = storedAiPrompt;
    }

    const storedXml = readStoredValue(STORAGE_KEYS.diagramXml).trim();
    if (storedXml) {
        fillXmlAndRender(storedXml, { persist: false });
    } else {
        try {
            const exampleXml = await loadExampleXml();
            fillXmlAndRender(exampleXml);
            fileNameManager.setSourceFileName("example.drawio");
        } catch (_error) {
            toast.show(t("toast.sampleLoadFailed"), true);
            render("");
        }
    }

    if (dom.loadingState) {
        dom.loadingState.style.display = "none";
    }

    registerAllEvents();
    onLanguageChange(refreshI18nDrivenUi);
}

window.addEventListener("load", initialize);
