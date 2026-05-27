export function registerAiEvents(options) {
    const {
        dom,
        t,
        toast,
        writeStoredValue,
        storageKeys,
        envApiKey,
        defaultModelName,
        defaultBaseUrl,
        defaultThinkingLevel,
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
    const MERMAID_THUMBNAIL_REFERENCE_KEY = "mermaid-thumbnail-reference";
    const IMAGE_SIZE_LIMIT_VALUES = new Set(["none", "a4-portrait", "a4-landscape"]);

    function getImageSizeLimitValue() {
        const value = String(dom.aiImageSizeLimitSelect?.value || "");
        return IMAGE_SIZE_LIMIT_VALUES.has(value) ? value : "none";
    }

    function setImageSizeLimitValue(value) {
        const sizeLimit = IMAGE_SIZE_LIMIT_VALUES.has(value) ? value : "none";
        dom.aiImageSizeLimitSelect.value = sizeLimit;
        writeStoredValue(storageKeys.aiImageSizeLimit, sizeLimit);
    }

    function buildPromptWithImageSizeLimit(basePrompt) {
        const sizeLimit = getImageSizeLimitValue();
        if (sizeLimit === "a4-portrait") {
            return `${basePrompt}\n\n${t("ai.imageSizeLimitPromptA4Portrait")}`;
        }
        if (sizeLimit === "a4-landscape") {
            return `${basePrompt}\n\n${t("ai.imageSizeLimitPromptA4Landscape")}`;
        }
        return basePrompt;
    }

    function utf8ToBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = "";
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return window.btoa(binary);
    }

    function loadImageDataUrl(dataUrl) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("無法將 Mermaid SVG 轉成 PNG"));
            image.src = dataUrl;
        });
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

    async function captureCurrentMermaidDiagramImage() {
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
        const svgDataUrl = `data:image/svg+xml;base64,${utf8ToBase64(serializedSvg)}`;
        const image = await loadImageDataUrl(svgDataUrl);
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        const context = canvas.getContext("2d");
        if (!context) {
            return null;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        return {
            mimeType: "image/png",
            dataUrl: canvas.toDataURL("image/png"),
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
            dom.aiPrompt.focus();
            return;
        }

        const promptKey = target.dataset.promptKey;
        if (!promptKey) {
            return;
        }

        dom.aiPrompt.value = t(promptKey);
        writeStoredValue(storageKeys.aiPrompt, dom.aiPrompt.value);
        if (promptKey === "ai.promptExampleMermaidToDrawio") {
            setImageSizeLimitValue("a4-portrait");
        }
        dom.aiPrompt.focus();
        const cursorPos = dom.aiPrompt.value.length;
        dom.aiPrompt.setSelectionRange(cursorPos, cursorPos);
    });

    dom.attachMermaidThumbnailBtn.addEventListener("click", async () => {
        const currentSourceFormat = getCurrentSourceFormat();
        if (currentSourceFormat !== "mermaid") {
            toast.show(t("toast.mermaidOnlyThumbnailAttachment"), true);
            return;
        }
        try {
            const mermaidImage = await captureCurrentMermaidDiagramImage();
            if (!mermaidImage?.dataUrl) {
                throw new Error("capture-failed");
            }
            referenceFilesController.upsertImageReference({
                key: MERMAID_THUMBNAIL_REFERENCE_KEY,
                name: t("ai.referenceMermaidThumbnailName"),
                mimeType: mermaidImage.mimeType || "image/png",
                dataUrl: mermaidImage.dataUrl
            });
            toast.show(t("toast.mermaidThumbnailAttached"));
        } catch (_error) {
            toast.show(t("toast.mermaidThumbnailAttachFailed"), true);
        }
    });

    dom.aiPrompt.addEventListener("input", () => {
        writeStoredValue(storageKeys.aiPrompt, dom.aiPrompt.value);
    });
    dom.aiImageSizeLimitSelect.addEventListener("change", () => {
        setImageSizeLimitValue(getImageSizeLimitValue());
    });

    const submitAiPrompt = async () => {
        const prompt = dom.aiPrompt.value.trim();
        const promptForAi = buildPromptWithImageSizeLimit(prompt);
        const currentXml = dom.xmlInput.value.trim();
        const currentSourceFormat = getCurrentSourceFormat();
        const apiKey = dom.apiKeyInput.value.trim() || envApiKey;
        const model = dom.modelInput.value.trim() || defaultModelName;
        const baseUrl = dom.geminiBaseUrlInput.value.trim() || defaultBaseUrl;
        const thinkingLevel = dom.geminiThinkingLevelSelect.value || defaultThinkingLevel;

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
        dom.geminiBaseUrlInput.value = baseUrl;
        dom.geminiThinkingLevelSelect.value = thinkingLevel;
        persistGeminiSettings();

        setAiLoading(true);
        try {
            const usedSelectedRegionImage = selectionController.getSelectedRegionImage();
            let diagramReferenceImage = selectionController.getDiagramReferenceImage();
            if (!diagramReferenceImage) {
                const imageReferenceFiles = referenceFilesController.getImageFiles();
                diagramReferenceImage = imageReferenceFiles[0] || null;
            }
            const referenceFiles = referenceFilesController.getFiles();
            const resultXml = await requestAiXml({
                prompt: promptForAi,
                currentXml,
                apiKey,
                model,
                baseUrl,
                thinkingLevel,
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
                prompt: promptForAi,
                resultXml,
                sourceFormat: getCurrentSourceFormat(),
                referenceFiles,
                usedSelectedRegionImage,
                fileName: fileNameManager.getEffectiveExportFileName(),
                thumbnailDataUrl
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
