function getRequiredElement(id) {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error(`找不到必要元素 #${id}`);
    }

    return element;
}

export function getDomElements() {
    return {
        xmlInput: getRequiredElement("xmlInput"),
        languageSelect: getRequiredElement("languageSelect"),
        urlInput: getRequiredElement("urlInput"),
        fetchBtn: getRequiredElement("fetchBtn"),
        dropzone: getRequiredElement("dropzone"),
        fileInput: getRequiredElement("fileInput"),
        uploadBtn: getRequiredElement("uploadBtn"),
        formatBtn: getRequiredElement("formatBtn"),
        loadSampleBtn: getRequiredElement("loadSampleBtn"),
        viewerContainer: getRequiredElement("viewerContainer"),
        toast: getRequiredElement("toast"),
        loadingState: getRequiredElement("loadingState"),
        apiKeyInput: getRequiredElement("apiKeyInput"),
        modelInput: getRequiredElement("modelInput"),
        aiPrompt: getRequiredElement("aiPrompt"),
        askAiBtn: getRequiredElement("askAiBtn"),
        askAiBtnText: getRequiredElement("askAiBtnText"),
        aiSpinner: getRequiredElement("aiSpinner"),
        geminiSettingsModal: getRequiredElement("geminiSettingsModal"),
        geminiSettingsBackdrop: getRequiredElement("geminiSettingsBackdrop"),
        openGeminiSettingsBtn: getRequiredElement("openGeminiSettingsBtn"),
        closeGeminiSettingsBtn: getRequiredElement("closeGeminiSettingsBtn"),
        cancelGeminiSettingsBtn: getRequiredElement("cancelGeminiSettingsBtn"),
        saveGeminiSettingsBtn: getRequiredElement("saveGeminiSettingsBtn")
    };
}
