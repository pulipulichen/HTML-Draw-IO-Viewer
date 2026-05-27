export function createUiStateController(options) {
    const { dom, t, writeStoredValue, storageKeys } = options;
    let isFetchLoading = false;
    let isAiLoading = false;
    let activeTab = "editor";
    let isSidebarCollapsed = false;

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

    function setSidebarCollapsed(collapsed, config = {}) {
        const { persist = true } = config;
        isSidebarCollapsed = Boolean(collapsed);
        const hideLabel = t("layout.sidebarHideBtn", "Hide Sidebar");
        const showLabel = t("layout.sidebarShowBtn", "Show Sidebar");
        document.body.classList.toggle("sidebar-collapsed", isSidebarCollapsed);
        dom.sidebarExpandBtn.classList.toggle("hidden", !isSidebarCollapsed);
        dom.sidebarToggleBtn.setAttribute("aria-label", hideLabel);
        dom.sidebarToggleBtn.setAttribute("title", hideLabel);
        dom.sidebarToggleBtn.setAttribute("aria-expanded", String(!isSidebarCollapsed));
        dom.sidebarExpandBtn.setAttribute("aria-label", showLabel);
        dom.sidebarExpandBtn.setAttribute("title", showLabel);
        if (persist) {
            writeStoredValue(storageKeys.sidebarCollapsed, isSidebarCollapsed ? "1" : "0");
        }
    }

    function toggleSidebarCollapsed() {
        setSidebarCollapsed(!isSidebarCollapsed);
    }

    return {
        getIsAiLoading: () => isAiLoading,
        getIsFetchLoading: () => isFetchLoading,
        getIsSidebarCollapsed: () => isSidebarCollapsed,
        setActiveTab,
        setAiLoading,
        setFetchLoading,
        setSidebarCollapsed,
        toggleSidebarCollapsed
    };
}
