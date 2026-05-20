export function createUiStateController(options) {
    const { dom, t, writeStoredValue, storageKeys } = options;
    let isFetchLoading = false;
    let isAiLoading = false;
    let activeTab = "editor";

    function normalizeTab(value) {
        if (value === "ai" || value === "versions") {
            return value;
        }
        return "editor";
    }

    function setFetchLoading(isLoading) {
        isFetchLoading = isLoading;
        dom.fetchBtn.disabled = isLoading;
        dom.fetchBtn.textContent = isLoading ? t("import.loadingBtn") : t("import.loadBtn");
    }

    function setAiLoading(isLoading) {
        isAiLoading = isLoading;
        dom.askAiBtn.disabled = isLoading;
        dom.aiDemoBtn.disabled = isLoading;
        dom.askAiBtnText.textContent = isLoading ? t("ai.askBtnLoading") : t("ai.askBtnIdle");
        dom.aiSpinner.classList.toggle("hidden", !isLoading);
        dom.askAiBtn.classList.toggle("opacity-75", isLoading);
        dom.askAiBtn.classList.toggle("cursor-not-allowed", isLoading);
        dom.aiDemoBtn.classList.toggle("opacity-75", isLoading);
        dom.aiDemoBtn.classList.toggle("cursor-not-allowed", isLoading);
        dom.aiLoadingOverlay.classList.toggle("hidden", !isLoading);
        dom.aiLoadingOverlay.classList.toggle("flex", isLoading);
    }

    function setActiveTab(nextTab, config = {}) {
        const { persist = true } = config;
        activeTab = normalizeTab(nextTab);
        dom.editorTabBtn.classList.toggle("active", activeTab === "editor");
        dom.aiTabBtn.classList.toggle("active", activeTab === "ai");
        dom.versionsTabBtn.classList.toggle("active", activeTab === "versions");
        dom.editorTabPanel.classList.toggle("hidden", activeTab !== "editor");
        dom.aiTabPanel.classList.toggle("hidden", activeTab !== "ai");
        dom.versionsTabPanel.classList.toggle("hidden", activeTab !== "versions");

        if (persist) {
            writeStoredValue(storageKeys.leftPanelTab, activeTab);
        }
    }

    return {
        getIsAiLoading: () => isAiLoading,
        getIsFetchLoading: () => isFetchLoading,
        setActiveTab,
        setAiLoading,
        setFetchLoading
    };
}
