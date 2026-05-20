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
        setAiLoading,
        openGeminiSettingsModal,
        persistGeminiSettings
    } = options;

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
                selectedRegionImage: usedSelectedRegionImage
            });

            fillXmlAndRender(resultXml);
            fileNameManager.markAiEdited();
            aiHistoryController.addEntry({
                prompt,
                resultXml,
                referenceFiles,
                usedSelectedRegionImage
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

    dom.askAiBtn.addEventListener("click", submitAiPrompt);

    dom.aiPrompt.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.ctrlKey) {
            event.preventDefault();
            submitAiPrompt();
        }
    });
}
