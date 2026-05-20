export function createSourceFormatController({ dom, viewer, writeStoredValue, storageKeys }) {
    let currentSourceFormat = "drawio";

    function updateMermaidConvertButtonVisibility() {
        const hasContent = Boolean(dom.xmlInput.value.trim());
        const showButton = hasContent && currentSourceFormat === "mermaid";
        dom.convertMermaidBtn.classList.toggle("hidden", !showButton);
    }

    function setSourceFormatHint(formatHint, { persist = true } = {}) {
        const supported = new Set(["auto", "drawio", "mermaid"]);
        const normalized = supported.has(formatHint) ? formatHint : "auto";
        dom.sourceFormatSelect.value = normalized;
        if (persist) {
            writeStoredValue(storageKeys.sourceFormat, normalized);
        }
    }

    function render(xmlText) {
        const renderFormat = viewer.render(xmlText, { formatHint: dom.sourceFormatSelect.value });
        currentSourceFormat = renderFormat === "empty" ? "drawio" : renderFormat;
        updateMermaidConvertButtonVisibility();
    }

    function getCurrentSourceFormat() {
        return currentSourceFormat;
    }

    return {
        render,
        setSourceFormatHint,
        getCurrentSourceFormat,
        updateMermaidConvertButtonVisibility
    };
}
