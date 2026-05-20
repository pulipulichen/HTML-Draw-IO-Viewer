export function createGeminiSettingsController(options) {
    const { dom, t, toast, readStoredValue, writeStoredValue, storageKeys, defaultModelName } = options;

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
        dom.modelInput.value = model;
        writeStoredValue(storageKeys.apiKey, apiKey);
        writeStoredValue(storageKeys.model, model);
    }

    function initializeGeminiSettings() {
        const savedApiKey = readStoredValue(storageKeys.apiKey);
        const savedModel = readStoredValue(storageKeys.model);
        dom.apiKeyInput.value = savedApiKey;
        dom.modelInput.value = savedModel || defaultModelName;
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
