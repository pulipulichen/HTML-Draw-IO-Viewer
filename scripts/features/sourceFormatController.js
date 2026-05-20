export function createSourceFormatController({
    dom,
    viewer,
    writeStoredValue,
    storageKeys,
    t = (key, fallback = key) => fallback
}) {
    let currentSourceFormat = "drawio";

    function applyModeBadge(badgeElement, modeLabel, isMermaid) {
        badgeElement.textContent = modeLabel;
        badgeElement.className = isMermaid
            ? "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border-emerald-200 bg-emerald-50"
            : "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border-indigo-200 bg-indigo-50";
    }

    function updateCurrentModeBadge() {
        const isMermaid = currentSourceFormat === "mermaid";
        const modeLabel = isMermaid
            ? t("ai.currentModeMermaid", "Mermaid")
            : t("ai.currentModeDrawio", "Draw.io XML");
        applyModeBadge(dom.currentSourceModeBadge, modeLabel, isMermaid);
    }

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
        updateCurrentModeBadge();
        updateMermaidConvertButtonVisibility();
    }

    function getCurrentSourceFormat() {
        return currentSourceFormat;
    }

    return {
        render,
        setSourceFormatHint,
        getCurrentSourceFormat,
        updateMermaidConvertButtonVisibility,
        refreshCurrentModeBadge: updateCurrentModeBadge
    };
}
