export function createSourceFormatController({
    dom,
    viewer,
    writeStoredValue,
    storageKeys,
    t = (key, fallback = key) => fallback
}) {
    let currentSourceFormat = "drawio";
    function looksLikeDrawioXml(sourceText) {
        const text = String(sourceText || "").trim();
        if (!text.startsWith("<")) {
            return false;
        }
        return /<mxfile[\s>]|<mxGraphModel[\s>]|<diagram[\s>]/i.test(text);
    }

    function applyModeBadge(badgeElement, modeLabel, isMermaid) {
        badgeElement.textContent = modeLabel;
        const classNames = [
            "inline-flex",
            "items-center",
            "rounded-full",
            "border",
            "px-2",
            "py-0.5",
            "text-[11px]",
            "font-semibold",
            "transition-colors"
        ];
        if (badgeElement instanceof HTMLButtonElement) {
            classNames.push(
                "cursor-pointer",
                "hover:brightness-95",
                "focus:outline-none",
                "focus:ring-2",
                "focus:ring-offset-1"
            );
        }
        if (isMermaid) {
            classNames.push(
                "text-emerald-700",
                "border-emerald-200",
                "bg-emerald-50",
                "focus:ring-emerald-400"
            );
        } else {
            classNames.push(
                "text-indigo-700",
                "border-indigo-200",
                "bg-indigo-50",
                "focus:ring-indigo-400"
            );
        }
        badgeElement.className = classNames.join(" ");
    }

    function updateCurrentModeBadge() {
        const isMermaid = currentSourceFormat === "mermaid";
        let modeLabel = t("ai.currentModeDrawio", "Draw.io");
        if (isMermaid) {
            modeLabel = t("ai.currentModeMermaid", "Mermaid");
        }
        applyModeBadge(dom.currentSourceModeBadge, modeLabel, isMermaid);
        if (dom.leftSidebar) {
            dom.leftSidebar.classList.toggle("sidebar-mode-mermaid", isMermaid);
            dom.leftSidebar.classList.toggle("sidebar-mode-drawio", !isMermaid);
            dom.leftSidebar.dataset.sourceMode = isMermaid ? "mermaid" : "drawio";
        }
    }

    function updateMermaidConvertButtonVisibility() {
        const hasContent = Boolean(dom.xmlInput.value.trim());
        const showButton = hasContent && currentSourceFormat === "mermaid";
        dom.convertMermaidBtn.classList.toggle("hidden", !showButton);
    }

    function updatePromptExamplesBySourceFormat() {
        const showDrawioExample = currentSourceFormat === "drawio";
        dom.drawioCompactPromptBtn.classList.toggle("hidden", !showDrawioExample);
        dom.drawioTranslatePromptBtn.classList.toggle("hidden", false);
        if (showDrawioExample) {
            dom.aiDemoBtn.textContent = t(
                "ai.demoBtnDrawio",
                "Demo: Translate to English (No Gemini)"
            );
            return;
        }
        dom.aiDemoBtn.textContent = t(
            "ai.demoBtnMermaid",
            "Demo: Switch to horizontal layout (No Gemini)"
        );
    }

    function updateReferenceUiBySourceFormat() {
        const isMermaid = currentSourceFormat === "mermaid";
        dom.attachMermaidThumbnailBtn.classList.toggle("hidden", !isMermaid);
    }

    function updateExportUiBySourceFormat() {
        const isMermaid = currentSourceFormat === "mermaid";
        dom.openInDrawioBtn.classList.toggle("hidden", isMermaid);
        dom.openDrawioLink.classList.toggle("hidden", isMermaid);
        dom.downloadXmlBtn.textContent = t("export.downloadBtn", "Download XML");
        if (isMermaid) {
            dom.downloadXmlBtn.textContent = t("export.downloadMmdBtn", "Download MMD");
        }
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
        const formatHint = dom.sourceFormatSelect.value;
        const renderFormat = viewer.render(xmlText, {
            formatHint,
            onMermaidRenderFailed: ({ sourceText }) => {
                if (formatHint !== "mermaid" || !looksLikeDrawioXml(sourceText)) {
                    return false;
                }
                setSourceFormatHint("drawio");
                const fallbackFormat = viewer.render(sourceText, { formatHint: "drawio" });
                currentSourceFormat = fallbackFormat === "empty" ? "drawio" : fallbackFormat;
                updateCurrentModeBadge();
                updateMermaidConvertButtonVisibility();
                updatePromptExamplesBySourceFormat();
                updateReferenceUiBySourceFormat();
                updateExportUiBySourceFormat();
                return true;
            }
        });
        currentSourceFormat = renderFormat === "empty" ? "drawio" : renderFormat;
        updateCurrentModeBadge();
        updateMermaidConvertButtonVisibility();
        updatePromptExamplesBySourceFormat();
        updateReferenceUiBySourceFormat();
        updateExportUiBySourceFormat();
    }

    function getCurrentSourceFormat() {
        return currentSourceFormat;
    }

    return {
        render,
        setSourceFormatHint,
        getCurrentSourceFormat,
        updateMermaidConvertButtonVisibility,
        updatePromptExamplesBySourceFormat,
        refreshReferenceUiBySourceFormat: updateReferenceUiBySourceFormat,
        refreshExportUiBySourceFormat: updateExportUiBySourceFormat,
        refreshCurrentModeBadge: updateCurrentModeBadge
    };
}
