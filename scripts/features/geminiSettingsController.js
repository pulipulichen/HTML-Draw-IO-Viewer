export function createGeminiSettingsController(options) {
    const {
        dom,
        t,
        toast,
        readStoredValue,
        writeStoredValue,
        storageKeys,
        defaultModelName,
        defaultBaseUrl,
        defaultThinkingLevel
    } = options;
    const THINKING_LEVEL_VALUES = new Set(["DEFAULT", "MINIMAL", "LOW", "MEDIUM", "HIGH"]);

    function normalizeBaseUrl(baseUrl) {
        return String(baseUrl || "").trim() || defaultBaseUrl;
    }

    function normalizeThinkingLevel(thinkingLevel) {
        const normalized = String(thinkingLevel || "").trim().toUpperCase();
        return THINKING_LEVEL_VALUES.has(normalized) ? normalized : defaultThinkingLevel;
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
        const model = dom.modelInput.value.trim() || defaultModelName;
        const baseUrl = normalizeBaseUrl(dom.geminiBaseUrlInput.value);
        const thinkingLevel = normalizeThinkingLevel(dom.geminiThinkingLevelSelect.value);
        dom.modelInput.value = model;
        dom.geminiBaseUrlInput.value = baseUrl;
        dom.geminiThinkingLevelSelect.value = thinkingLevel;
        writeStoredValue(storageKeys.apiKey, apiKey);
        writeStoredValue(storageKeys.model, model);
        writeStoredValue(storageKeys.baseUrl, baseUrl);
        writeStoredValue(storageKeys.thinkingLevel, thinkingLevel);
    }

    function initializeGeminiSettings() {
        const savedApiKey = readStoredValue(storageKeys.apiKey);
        const savedModel = readStoredValue(storageKeys.model);
        const savedBaseUrl = readStoredValue(storageKeys.baseUrl);
        const savedThinkingLevel = readStoredValue(storageKeys.thinkingLevel);
        dom.apiKeyInput.value = savedApiKey;
        dom.modelInput.value = savedModel || defaultModelName;
        dom.geminiBaseUrlInput.value = normalizeBaseUrl(savedBaseUrl);
        dom.geminiThinkingLevelSelect.value = normalizeThinkingLevel(savedThinkingLevel);
    }

    function registerGeminiSettingsEvents(shortcutsController) {
        dom.openGeminiSettingsBtn.addEventListener("click", openGeminiSettingsModal);
        dom.closeGeminiSettingsBtn.addEventListener("click", closeGeminiSettingsModal);
        dom.cancelGeminiSettingsBtn.addEventListener("click", closeGeminiSettingsModal);
        dom.geminiSettingsBackdrop.addEventListener("click", closeGeminiSettingsModal);

        dom.saveGeminiSettingsBtn.addEventListener("click", () => {
            persistGeminiSettings();
            closeGeminiSettingsModal();
            toast.show(t("toast.settingsSaved"));
        });

        dom.apiKeyInput.addEventListener("change", persistGeminiSettings);
        dom.modelInput.addEventListener("change", persistGeminiSettings);
        dom.geminiBaseUrlInput.addEventListener("change", persistGeminiSettings);
        dom.geminiThinkingLevelSelect.addEventListener("change", persistGeminiSettings);

        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !dom.geminiSettingsModal.classList.contains("hidden")) {
                closeGeminiSettingsModal();
                return;
            }
            if (event.key === "Escape" && shortcutsController && shortcutsController.isOpen()) {
                shortcutsController.close();
            }
        });
    }

    return {
        closeGeminiSettingsModal,
        initializeGeminiSettings,
        openGeminiSettingsModal,
        persistGeminiSettings,
        registerGeminiSettingsEvents
    };
}
