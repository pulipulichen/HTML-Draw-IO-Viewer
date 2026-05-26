import { registerAiEvents } from "./aiEventBindings.js";
import {
    registerExportEvents,
    registerFileEvents,
    registerFileNameEvents,
    registerInputEvents,
    registerTabEvents,
    registerUrlEvents
} from "./appEventBindings.js";
import { detectDiagramSourceFormat } from "../core/viewer/format.js";

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
        defaultBaseUrl,
        defaultThinkingLevel,
        requestAiXml,
        selectionController,
        referenceFilesController,
        aiPromptHistoryController,
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
        inferFileSourceFormat: (file, text) => {
            const detectedFormat = detectDiagramSourceFormat(text);
            if (detectedFormat) {
                return detectedFormat;
            }
            const name = String(file?.name || "").toLowerCase();
            if (name.endsWith(".mmd") || name.endsWith(".mermaid")) {
                return "mermaid";
            }
            if (name.endsWith(".xml") || name.endsWith(".drawio")) {
                return "drawio";
            }
            return null;
        }
    });

    registerExportEvents({
        dom,
        toast,
        t,
        drawioEditorUrl,
        fileNameManager,
        getCurrentSourceFormat
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
        defaultBaseUrl,
        defaultThinkingLevel,
        requestAiXml,
        selectionController,
        referenceFilesController,
        aiPromptHistoryController,
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
        aiPromptHistoryController,
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
    aiPromptHistoryController.initialize();
    aiHistoryController.initialize();
    selectionController.initialize();
    uiStateController.setActiveTab(readStoredValue(storageKeys.leftPanelTab), { persist: false });

    const storedAiPrompt = readStoredValue(storageKeys.aiPrompt);
    if (storedAiPrompt) {
        dom.aiPrompt.value = storedAiPrompt;
    }
    const validImageSizeLimits = new Set(["none", "a4-portrait", "a4-landscape"]);
    const storedImageSizeLimit = readStoredValue(storageKeys.aiImageSizeLimit);
    dom.aiImageSizeLimitSelect.value =
        validImageSizeLimits.has(storedImageSizeLimit) ? storedImageSizeLimit : "none";

    const initialSourceFormat = readStoredValue(storageKeys.sourceFormat) || "auto";
    setSourceFormatHint(initialSourceFormat, { persist: false });
    // Register interaction handlers early so tests/users can interact
    // immediately after page load, even while initial sample fetch is in flight.
    registerEvents();

    const storedXml = readStoredValue(storageKeys.diagramXml).trim();
    if (storedXml) {
        fillXmlAndRender(storedXml, { persist: false });
    } else {
        try {
            const preferredSampleFormat = initialSourceFormat === "mermaid" ? "mermaid" : "drawio";
            const sample = await loadExampleXml(preferredSampleFormat);
            // Avoid clobbering user/test input when they interact before
            // the async sample fetch resolves.
            if (!dom.xmlInput.value.trim()) {
                fillXmlAndRender(sample.content, { sourceFormatHint: sample.sourceFormatHint });
                fileNameManager.setSourceFileName(sample.fileName);
            }
        } catch (_error) {
            if (!dom.xmlInput.value.trim()) {
                toast.show(t("toast.sampleLoadFailed"), true);
                render("");
            }
        }
    }

    if (dom.loadingState) {
        dom.loadingState.style.display = "none";
    }
    onLanguageChange(refreshI18nDrivenUi);
}
