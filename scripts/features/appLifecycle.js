import { registerAiEvents } from "./aiEventBindings.js";
import {
    registerExportEvents,
    registerFileEvents,
    registerFileNameEvents,
    registerInputEvents,
    registerTabEvents,
    registerUrlEvents
} from "./appEventBindings.js";

export function registerAppEvents(options) {
    const {
        dom,
        writeStoredValue,
        storageKeys,
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
        drawioEditorUrl,
        envApiKey,
        defaultModelName,
        requestAiXml,
        selectionController,
        referenceFilesController,
        geminiSettingsController,
        shortcutsController,
        getCurrentSourceFormat
    } = options;

    registerInputEvents({
        dom,
        writeStoredValue,
        storageKeys,
        debounce,
        render,
        toast,
        t,
        loadExampleXml,
        fillXmlAndRender,
        fileNameManager,
        setSourceFormatHint,
        getCurrentSourceFormat,
        onSampleLoaded: async (xmlText) => {
            const thumbnailDataUrl = await captureHistoryThumbnail();
            aiHistoryController.addEntry({
                prompt: t("history.sampleLoadPrompt"),
                resultXml: xmlText,
                sourceFormat: getCurrentSourceFormat(),
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
        fileNameManager,
        onFileLoaded: (file) => {
            const name = String(file?.name || "").toLowerCase();
            if (name.endsWith(".mmd") || name.endsWith(".mermaid")) {
                setSourceFormatHint("mermaid");
                return;
            }
            setSourceFormatHint("drawio");
        }
    });

    registerExportEvents({
        dom,
        toast,
        t,
        drawioEditorUrl,
        fileNameManager
    });

    registerFileNameEvents({ dom, fileNameManager });

    registerAiEvents({
        dom,
        t,
        toast,
        writeStoredValue,
        storageKeys,
        envApiKey,
        defaultModelName,
        requestAiXml,
        selectionController,
        referenceFilesController,
        aiHistoryController,
        fillXmlAndRender,
        fileNameManager,
        captureHistoryThumbnail,
        setAiLoading: uiStateController.setAiLoading,
        openGeminiSettingsModal: geminiSettingsController.openGeminiSettingsModal,
        persistGeminiSettings: geminiSettingsController.persistGeminiSettings,
        getCurrentSourceFormat
    });

    geminiSettingsController.registerGeminiSettingsEvents(shortcutsController);
    shortcutsController.registerShortcutsModalEvents();
    shortcutsController.registerKeyboardShortcuts();
}

export async function initializeApp(options) {
    const {
        dom,
        uiStateController,
        geminiSettingsController,
        referenceFilesController,
        aiHistoryController,
        selectionController,
        readStoredValue,
        storageKeys,
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
    } = options;

    uiStateController.setFetchLoading(false);
    uiStateController.setAiLoading(false);

    geminiSettingsController.initializeGeminiSettings();
    referenceFilesController.initialize();
    aiHistoryController.initialize();
    selectionController.initialize();
    uiStateController.setActiveTab(readStoredValue(storageKeys.leftPanelTab), { persist: false });

    const storedAiPrompt = readStoredValue(storageKeys.aiPrompt);
    if (storedAiPrompt) {
        dom.aiPrompt.value = storedAiPrompt;
    }

    setSourceFormatHint(readStoredValue(storageKeys.sourceFormat) || "auto", { persist: false });

    const storedXml = readStoredValue(storageKeys.diagramXml).trim();
    if (storedXml) {
        fillXmlAndRender(storedXml, { persist: false });
    } else {
        try {
            const sample = await loadExampleXml("drawio");
            fillXmlAndRender(sample.content, { sourceFormatHint: sample.sourceFormatHint });
            fileNameManager.setSourceFileName(sample.fileName);
        } catch (_error) {
            toast.show(t("toast.sampleLoadFailed"), true);
            render("");
        }
    }

    if (dom.loadingState) {
        dom.loadingState.style.display = "none";
    }

    registerEvents();
    onLanguageChange(refreshI18nDrivenUi);
}
