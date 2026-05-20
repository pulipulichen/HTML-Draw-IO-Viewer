export function registerAiEvents(options) {
    const {
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
        setAiLoading,
        openGeminiSettingsModal,
        persistGeminiSettings,
        getCurrentSourceFormat
    } = options;
    const AI_DEMO_PROMPT = "翻譯成英文";
    const AI_DEMO_FILE_PATH = "./demo/example2.drawio";

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
            writeStoredValue(storageKeys.aiPrompt, "");
            dom.aiPrompt.focus();
            return;
        }

        const promptKey = target.dataset.promptKey;
        if (!promptKey) {
            return;
        }

        dom.aiPrompt.value = t(promptKey);
        writeStoredValue(storageKeys.aiPrompt, dom.aiPrompt.value);
        dom.aiPrompt.focus();
        const cursorPos = dom.aiPrompt.value.length;
        dom.aiPrompt.setSelectionRange(cursorPos, cursorPos);
    });

    dom.aiPrompt.addEventListener("input", () => {
        writeStoredValue(storageKeys.aiPrompt, dom.aiPrompt.value);
    });

    const submitAiPrompt = async () => {
        const prompt = dom.aiPrompt.value.trim();
        const currentXml = dom.xmlInput.value.trim();
        const currentSourceFormat = getCurrentSourceFormat();
        const apiKey = dom.apiKeyInput.value.trim() || envApiKey;
        const model = dom.modelInput.value.trim() || defaultModelName;

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
                selectedRegionImage: usedSelectedRegionImage,
                sourceFormat: currentSourceFormat
            });

            fillXmlAndRender(resultXml);
            fileNameManager.markAiEdited();
            const thumbnailDataUrl = await captureHistoryThumbnail();
            aiHistoryController.addEntry({
                prompt,
                resultXml,
                referenceFiles,
                usedSelectedRegionImage,
                fileName: fileNameManager.getEffectiveExportFileName(),
                thumbnailDataUrl
            });
            dom.aiPrompt.value = "";
            writeStoredValue(storageKeys.aiPrompt, "");
            toast.show(t("toast.aiUpdated"));
        } catch (error) {
            console.error("AI 請求失敗:", error);
            toast.show(`${t("toast.aiRequestFailed")}: ${error.message}`, true);
        } finally {
            setAiLoading(false);
        }
    };

    const submitMermaidToDrawioConversion = async () => {
        const currentSourceText = dom.xmlInput.value.trim();
        const apiKey = dom.apiKeyInput.value.trim() || envApiKey;
        const model = dom.modelInput.value.trim() || defaultModelName;
        const currentSourceFormat = getCurrentSourceFormat();

        if (!currentSourceText) {
            toast.show(t("toast.noDiagramToSelect"), true);
            return;
        }

        if (currentSourceFormat !== "mermaid") {
            toast.show(t("toast.mermaidOnlyConversion"), true);
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

        const conversionPrompt =
            "請把以下 Mermaid 圖表語法完整轉換成 Draw.io (mxGraph) XML，保持流程、連線關係與節點語意一致。若 Mermaid 有 subgraph，請在 Draw.io 以群組或容器呈現。\n\n" +
            currentSourceText;

        setAiLoading(true);
        try {
            const resultXml = await requestAiXml({
                prompt: conversionPrompt,
                currentXml: "",
                apiKey,
                model,
                referenceFiles: [],
                selectedRegionImage: null,
                sourceFormat: "mermaid"
            });

            fillXmlAndRender(resultXml, { sourceFormatHint: "drawio" });
            fileNameManager.markAiEdited();
            const thumbnailDataUrl = await captureHistoryThumbnail();
            aiHistoryController.addEntry({
                prompt: t("history.mermaidConvertPrompt", "Convert Mermaid to Draw.io"),
                resultXml,
                referenceFiles: [],
                usedSelectedRegionImage: null,
                fileName: fileNameManager.getEffectiveExportFileName(),
                thumbnailDataUrl
            });
            toast.show(t("toast.mermaidConverted"));
        } catch (error) {
            console.error("Mermaid 轉換失敗:", error);
            toast.show(`${t("toast.aiRequestFailed")}: ${error.message}`, true);
        } finally {
            setAiLoading(false);
        }
    };

    dom.askAiBtn.addEventListener("click", submitAiPrompt);
    dom.convertMermaidBtn.addEventListener("click", submitMermaidToDrawioConversion);
    dom.aiDemoBtn.addEventListener("click", async () => {
        setAiLoading(true);
        try {
            const response = await window.fetch(AI_DEMO_FILE_PATH, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`載入 demo 檔案失敗 (${response.status})`);
            }

            const resultXml = await response.text();
            dom.aiPrompt.value = AI_DEMO_PROMPT;
            writeStoredValue(storageKeys.aiPrompt, dom.aiPrompt.value);
            fillXmlAndRender(resultXml);
            fileNameManager.markAiEdited();
            const thumbnailDataUrl = await captureHistoryThumbnail();
            aiHistoryController.addEntry({
                prompt: AI_DEMO_PROMPT,
                resultXml,
                referenceFiles: [],
                usedSelectedRegionImage: null,
                fileName: fileNameManager.getEffectiveExportFileName(),
                thumbnailDataUrl
            });
            toast.show(t("toast.aiDemoApplied"));
        } catch (error) {
            console.error("AI Demo 載入失敗:", error);
            toast.show(`${t("toast.aiRequestFailed")}: ${error.message}`, true);
        } finally {
            setAiLoading(false);
        }
    });

    dom.aiPrompt.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.ctrlKey) {
            event.preventDefault();
            submitAiPrompt();
        }
    });
}
