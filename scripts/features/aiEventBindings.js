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
        aiPromptHistoryController,
        aiHistoryController,
        fillXmlAndRender,
        fileNameManager,
        captureHistoryThumbnail,
        setAiLoading,
        openGeminiSettingsModal,
        persistGeminiSettings,
        getCurrentSourceFormat
    } = options;
    const AI_DEMO_CONFIG = {
        drawio: {
            prompt: "請保留目前圖表的結構與連線，將所有節點與標籤文字翻譯成英文。",
            filePath: "./demo/drawio_example2.drawio"
        },
        mermaid: {
            prompt: "請保留結構，改成橫向排列（由左到右）",
            filePath: "./demo/mermaid_example2.mmd"
        }
    };
    let shouldAttachMermaidReferenceImage = false;

    function utf8ToBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = "";
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return window.btoa(binary);
    }

    function getRenderedDiagramSvgElement() {
        const diagramHost = dom.viewerContainer.querySelector('[data-viewer-role="diagram-host"]');
        const hostCandidates = diagramHost ? Array.from(diagramHost.querySelectorAll("svg")) : [];
        const fallbackCandidates = Array.from(dom.viewerContainer.querySelectorAll("svg"));
        const candidates = [...hostCandidates, ...fallbackCandidates];
        if (!candidates.length) {
            return null;
        }

        let bestElement = null;
        let bestArea = 0;
        candidates.forEach((candidate) => {
            if (!(candidate instanceof SVGElement)) {
                return;
            }
            const rect = candidate.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                return;
            }
            const area = rect.width * rect.height;
            if (area > bestArea) {
                bestArea = area;
                bestElement = candidate;
            }
        });
        return bestElement;
    }

    function captureCurrentMermaidDiagramImage() {
        const sourceSvg = getRenderedDiagramSvgElement();
        if (!(sourceSvg instanceof SVGElement)) {
            return null;
        }
        const rect = sourceSvg.getBoundingClientRect();
        const viewBox = sourceSvg.viewBox?.baseVal;
        const hasViewBoxWidth = viewBox && Number.isFinite(viewBox.width) && viewBox.width > 0;
        const hasViewBoxHeight = viewBox && Number.isFinite(viewBox.height) && viewBox.height > 0;
        const width = (hasViewBoxWidth ? Math.round(viewBox.width) : Math.round(rect.width)) || 0;
        const height = (hasViewBoxHeight ? Math.round(viewBox.height) : Math.round(rect.height)) || 0;
        if (!width || !height) {
            return null;
        }

        const clonedSvg = sourceSvg.cloneNode(true);
        if (!(clonedSvg instanceof SVGElement)) {
            return null;
        }
        if (!clonedSvg.getAttribute("xmlns")) {
            clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        if (!clonedSvg.getAttribute("xmlns:xlink")) {
            clonedSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        }
        clonedSvg.setAttribute("width", String(width));
        clonedSvg.setAttribute("height", String(height));
        if (!clonedSvg.getAttribute("viewBox")) {
            clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        }

        const serializedSvg = new XMLSerializer().serializeToString(clonedSvg);
        const dataUrl = `data:image/svg+xml;base64,${utf8ToBase64(serializedSvg)}`;
        return {
            mimeType: "image/svg+xml",
            dataUrl,
            width,
            height
        };
    }

    function looksLikeDrawioXml(text) {
        const normalized = text.trim();
        if (!normalized.startsWith("<")) {
            return false;
        }
        return /<mxfile[\s>]|<mxGraphModel[\s>]|<diagram[\s>]/i.test(normalized);
    }

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
            shouldAttachMermaidReferenceImage = false;
            dom.aiPrompt.focus();
            return;
        }

        const promptKey = target.dataset.promptKey;
        if (!promptKey) {
            return;
        }

        dom.aiPrompt.value = t(promptKey);
        writeStoredValue(storageKeys.aiPrompt, dom.aiPrompt.value);
        shouldAttachMermaidReferenceImage = promptKey === "ai.promptExampleMermaidToDrawio";
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

        aiPromptHistoryController.addPrompt(prompt);
        dom.modelInput.value = model;
        persistGeminiSettings();

        setAiLoading(true);
        try {
            const usedSelectedRegionImage = selectionController.getSelectedRegionImage();
            let diagramReferenceImage = selectionController.getDiagramReferenceImage();
            let mermaidReferenceImage = null;
            if (
                !usedSelectedRegionImage &&
                !diagramReferenceImage &&
                shouldAttachMermaidReferenceImage &&
                currentSourceFormat === "mermaid"
            ) {
                mermaidReferenceImage = captureCurrentMermaidDiagramImage();
            }
            if (!diagramReferenceImage) {
                diagramReferenceImage = mermaidReferenceImage;
            }
            const referenceFiles = referenceFilesController.getFiles();
            const resultXml = await requestAiXml({
                prompt,
                currentXml,
                apiKey,
                model,
                referenceFiles,
                selectedRegionImage: usedSelectedRegionImage,
                diagramReferenceImage,
                sourceFormat: currentSourceFormat
            });

            const shouldSwitchToDrawio = looksLikeDrawioXml(resultXml);
            if (shouldSwitchToDrawio) {
                fillXmlAndRender(resultXml, { sourceFormatHint: "drawio" });
                fileNameManager.setSourceFormatExtension("drawio");
            } else {
                fillXmlAndRender(resultXml);
            }
            fileNameManager.markAiEdited();
            const thumbnailDataUrl = await captureHistoryThumbnail();
            aiHistoryController.addEntry({
                prompt,
                resultXml,
                sourceFormat: getCurrentSourceFormat(),
                referenceFiles,
                usedSelectedRegionImage,
                fileName: fileNameManager.getEffectiveExportFileName(),
                thumbnailDataUrl
            });
            dom.aiPrompt.value = "";
            writeStoredValue(storageKeys.aiPrompt, "");
            shouldAttachMermaidReferenceImage = false;
            toast.show(t("toast.aiUpdated"));
        } catch (error) {
            console.error("AI 請求失敗:", error);
            toast.show(`${t("toast.aiRequestFailed")}: ${error.message}`, true);
        } finally {
            setAiLoading(false);
        }
    };

    dom.askAiBtn.addEventListener("click", submitAiPrompt);
    dom.aiDemoBtn.addEventListener("click", async () => {
        const currentSourceFormat = getCurrentSourceFormat();
        const demoConfig =
            currentSourceFormat === "mermaid" ? AI_DEMO_CONFIG.mermaid : AI_DEMO_CONFIG.drawio;
        setAiLoading(true);
        try {
            const response = await window.fetch(demoConfig.filePath, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`載入 demo 檔案失敗 (${response.status})`);
            }

            const resultXml = await response.text();
            dom.aiPrompt.value = demoConfig.prompt;
            writeStoredValue(storageKeys.aiPrompt, dom.aiPrompt.value);
            if (currentSourceFormat === "mermaid") {
                fillXmlAndRender(resultXml, { sourceFormatHint: "mermaid" });
            } else {
                fillXmlAndRender(resultXml, { sourceFormatHint: "drawio" });
            }
            fileNameManager.markAiEdited();
            const thumbnailDataUrl = await captureHistoryThumbnail();
            aiHistoryController.addEntry({
                prompt: demoConfig.prompt,
                resultXml,
                sourceFormat: getCurrentSourceFormat(),
                referenceFiles: [],
                usedSelectedRegionImage: null,
                fileName: fileNameManager.getEffectiveExportFileName(),
                thumbnailDataUrl
            });
            let demoToastKey = "toast.aiDemoAppliedDrawio";
            if (currentSourceFormat === "mermaid") {
                demoToastKey = "toast.aiDemoAppliedMermaid";
            }
            toast.show(t(demoToastKey));
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
