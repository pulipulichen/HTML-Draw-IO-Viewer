function triggerXmlDownload(xmlText, fileName) {
    const blob = new Blob([xmlText], { type: "application/xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
}

const HTML_TO_IMAGE_MODULE_URL = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm";
let htmlToImageModulePromise = null;

function loadHtmlToImageModule() {
    if (!htmlToImageModulePromise) {
        htmlToImageModulePromise = import(HTML_TO_IMAGE_MODULE_URL);
    }
    return htmlToImageModulePromise;
}

function getPngExportFileName(fileName) {
    const normalized = String(fileName || "diagram.drawio").trim() || "diagram.drawio";
    const dotIndex = normalized.lastIndexOf(".");
    if (dotIndex <= 0) {
        return `${normalized}.png`;
    }
    return `${normalized.slice(0, dotIndex)}.png`;
}

function parseNumericAttribute(value) {
    const parsed = Number.parseFloat(String(value || "").trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function parseViewBoxDimensions(viewBoxAttr) {
    const normalized = String(viewBoxAttr || "").trim();
    if (!normalized) {
        return null;
    }
    const parts = normalized.split(/\s+/);
    if (parts.length !== 4) {
        return null;
    }
    const width = parseNumericAttribute(parts[2]);
    const height = parseNumericAttribute(parts[3]);
    if (!width || !height) {
        return null;
    }
    return { width, height };
}

function resolveSvgExportDimensions(svgElement) {
    const viewBoxDims = parseViewBoxDimensions(svgElement.getAttribute("viewBox"));
    const attrWidth = parseNumericAttribute(svgElement.getAttribute("width"));
    const attrHeight = parseNumericAttribute(svgElement.getAttribute("height"));
    const rect = svgElement.getBoundingClientRect();
    const rectWidth = parseNumericAttribute(rect.width);
    const rectHeight = parseNumericAttribute(rect.height);
    let bboxWidth = null;
    let bboxHeight = null;

    try {
        if (typeof svgElement.getBBox === "function") {
            const bbox = svgElement.getBBox();
            bboxWidth = parseNumericAttribute(bbox.width);
            bboxHeight = parseNumericAttribute(bbox.height);
        }
    } catch (_error) {
        // Some SVG trees (e.g. with foreignObject) may throw here; ignore and fallback.
    }

    let width = Math.max(
        1,
        Math.ceil(attrWidth || viewBoxDims?.width || rectWidth || svgElement.clientWidth || bboxWidth || 1)
    );
    let height = Math.max(
        1,
        Math.ceil(attrHeight || viewBoxDims?.height || rectHeight || svgElement.clientHeight || bboxHeight || 1)
    );

    const maxEdge = 8192;
    const largerEdge = Math.max(width, height);
    if (largerEdge > maxEdge) {
        const scale = maxEdge / largerEdge;
        width = Math.max(1, Math.floor(width * scale));
        height = Math.max(1, Math.floor(height * scale));
    }

    return { width, height };
}

function stripCrossOriginImageNodes(svgElement) {
    const imageNodes = Array.from(svgElement.querySelectorAll("image"));
    imageNodes.forEach((imageNode) => {
        const href =
            imageNode.getAttribute("href") ||
            imageNode.getAttribute("xlink:href") ||
            imageNode.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
            "";
        const normalizedHref = String(href).trim().toLowerCase();
        if (normalizedHref.startsWith("http://") || normalizedHref.startsWith("https://")) {
            imageNode.remove();
        }
    });
}

function isSvgElement(node) {
    return (
        node instanceof Element &&
        String(node.tagName || "").toLowerCase() === "svg"
    );
}

function isRectElement(node) {
    return (
        node instanceof Element &&
        String(node.tagName || "").toLowerCase() === "rect"
    );
}

function removeFullCanvasBackgroundRect(svgElement, fallbackWidth, fallbackHeight) {
    const directChildren = Array.from(svgElement.children);
    const rectCandidates = directChildren.filter((node) => isRectElement(node));
    if (!rectCandidates.length) {
        return;
    }

    const viewBoxAttr = svgElement.getAttribute("viewBox");
    let viewWidth = fallbackWidth;
    let viewHeight = fallbackHeight;
    if (viewBoxAttr) {
        const parts = viewBoxAttr.trim().split(/\s+/);
        if (parts.length === 4) {
            viewWidth = parseNumericAttribute(parts[2]) ?? viewWidth;
            viewHeight = parseNumericAttribute(parts[3]) ?? viewHeight;
        }
    } else {
        viewWidth = parseNumericAttribute(svgElement.getAttribute("width")) ?? viewWidth;
        viewHeight = parseNumericAttribute(svgElement.getAttribute("height")) ?? viewHeight;
    }

    if (!viewWidth || !viewHeight) {
        return;
    }

    const tolerance = 0.5;
    const backgroundRect = rectCandidates.find((rect) => {
        const x = parseNumericAttribute(rect.getAttribute("x")) ?? 0;
        const y = parseNumericAttribute(rect.getAttribute("y")) ?? 0;
        const width = parseNumericAttribute(rect.getAttribute("width"));
        const height = parseNumericAttribute(rect.getAttribute("height"));
        if (!width || !height) {
            return false;
        }
        const fillsCanvas =
            Math.abs(x) <= tolerance &&
            Math.abs(y) <= tolerance &&
            Math.abs(width - viewWidth) <= tolerance &&
            Math.abs(height - viewHeight) <= tolerance;
        if (!fillsCanvas) {
            return false;
        }
        const fill = String(rect.getAttribute("fill") || "").trim().toLowerCase();
        const fillOpacity = parseNumericAttribute(rect.getAttribute("fill-opacity"));
        if (fillOpacity === 0 || fill === "none") {
            return false;
        }
        return true;
    });

    if (backgroundRect) {
        backgroundRect.remove();
    }
}

function buildTransparentSvgMarkup(sourceSvg) {
    const { width: fallbackWidth, height: fallbackHeight } = resolveSvgExportDimensions(sourceSvg);
    const exportSvg = sourceSvg.cloneNode(true);

    if (!isSvgElement(exportSvg)) {
        throw new Error("svg clone failed");
    }

    exportSvg.removeAttribute("style");
    exportSvg.style.background = "transparent";
    exportSvg.style.backgroundColor = "transparent";
    if (!exportSvg.getAttribute("xmlns")) {
        exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    if (!exportSvg.getAttribute("xmlns:xlink")) {
        exportSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    }

    if (!exportSvg.getAttribute("viewBox")) {
        exportSvg.setAttribute("viewBox", `0 0 ${fallbackWidth} ${fallbackHeight}`);
    }
    if (!parseNumericAttribute(exportSvg.getAttribute("width"))) {
        exportSvg.setAttribute("width", String(fallbackWidth));
    }
    if (!parseNumericAttribute(exportSvg.getAttribute("height"))) {
        exportSvg.setAttribute("height", String(fallbackHeight));
    }

    stripCrossOriginImageNodes(exportSvg);
    removeFullCanvasBackgroundRect(exportSvg, fallbackWidth, fallbackHeight);
    return new XMLSerializer().serializeToString(exportSvg);
}

async function drawSvgBlobToCanvas(canvas, context, svgBlob) {
    const renderFromBitmap = async () => {
        if (typeof window.createImageBitmap !== "function") {
            throw new Error("createImageBitmap unavailable");
        }
        const bitmap = await window.createImageBitmap(svgBlob);
        try {
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        } finally {
            if (typeof bitmap.close === "function") {
                bitmap.close();
            }
        }
    };

    const renderFromUrl = async (url) => {
        const image = new Image();
        image.decoding = "sync";
        image.src = url;
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };

    try {
        await renderFromBitmap();
        return;
    } catch (_bitmapError) {
        // Continue with URL-based fallback.
    }

    const objectUrl = URL.createObjectURL(svgBlob);
    try {
        await renderFromUrl(objectUrl);
        return;
    } catch (_objectUrlError) {
        // Continue with data URL fallback.
    } finally {
        URL.revokeObjectURL(objectUrl);
    }

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("svg data url conversion failed"));
        reader.readAsDataURL(svgBlob);
    });
    await renderFromUrl(dataUrl);
}

async function exportDiagramAsTransparentPng({ dom, fileNameManager, toast, t }) {
    const diagramHost = dom.viewerContainer.querySelector('[data-viewer-role="diagram-host"]');
    const sourceSvg = diagramHost?.querySelector("svg");
    if (!isSvgElement(sourceSvg)) {
        toast.show(t("toast.noDiagramToDownload"), true);
        return;
    }

    try {
        const exportFileName = getPngExportFileName(fileNameManager.getEffectiveExportFileName());
        const { width: exportWidth, height: exportHeight } = resolveSvgExportDimensions(sourceSvg);
        const svgMarkup = buildTransparentSvgMarkup(sourceSvg);
        const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });

        const canvas = document.createElement("canvas");
        canvas.width = exportWidth;
        canvas.height = exportHeight;

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("canvas context unavailable");
        }

        let rendered = false;
        try {
            await drawSvgBlobToCanvas(canvas, context, svgBlob);
            rendered = true;
        } catch (_svgDrawError) {
            rendered = false;
        }

        let pngBlob = null;
        if (rendered) {
            // Keep canvas alpha channel untouched to export transparent background PNG.
            pngBlob = await new Promise((resolve, reject) =>
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                        return;
                    }
                    reject(new Error("png encoding failed"));
                }, "image/png")
            );
        }

        if (!pngBlob) {
            try {
                const module = await loadHtmlToImageModule();
                const hostRect = diagramHost.getBoundingClientRect();
                const width = Math.max(1, Math.floor(hostRect.width || exportWidth || 1));
                const height = Math.max(1, Math.floor(hostRect.height || exportHeight || 1));
                if (typeof module?.toBlob === "function") {
                    pngBlob = await module.toBlob(diagramHost, {
                        cacheBust: true,
                        backgroundColor: "rgba(0,0,0,0)",
                        pixelRatio: 2,
                        width,
                        height
                    });
                }
            } catch (_fallbackError) {
                pngBlob = null;
            }
        }

        if (!pngBlob) {
            throw new Error("png encoding failed");
        }

        const pngUrl = URL.createObjectURL(pngBlob);
        const anchor = document.createElement("a");
        anchor.href = pngUrl;
        anchor.download = exportFileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(pngUrl);
        toast.show(t("toast.pngDownloadStarted"));
    } catch (error) {
        console.error("Transparent PNG export failed:", error);
        toast.show(t("toast.pngDownloadFailed"), true);
    }
}

export function registerInputEvents(options) {
    const {
        dom,
        writeStoredValue,
        storageKeys,
        debounce,
        render,
        toast,
        t,
        loadExampleXml,
        fillXmlAndRender,
        fileNameManager,
        onSampleLoaded = async () => {},
        setSourceFormatHint = () => {},
        getCurrentSourceFormat = () => "drawio"
    } = options;

    dom.xmlInput.addEventListener("input", () => {
        writeStoredValue(storageKeys.diagramXml, dom.xmlInput.value);
    });

    dom.sourceFormatSelect.addEventListener("change", async () => {
        writeStoredValue(storageKeys.sourceFormat, dom.sourceFormatSelect.value);
        const selectedFormat = dom.sourceFormatSelect.value;
        const shouldLoadSample = !dom.xmlInput.value.trim();
        if (shouldLoadSample && (selectedFormat === "drawio" || selectedFormat === "mermaid")) {
            try {
                const sample = await loadExampleXml(selectedFormat);
                setSourceFormatHint(sample.sourceFormatHint);
                fillXmlAndRender(sample.content, { sourceFormatHint: sample.sourceFormatHint });
                fileNameManager.setSourceFileName(sample.fileName);
                toast.show(t("toast.sampleLoaded"));
                return;
            } catch (_error) {
                toast.show(t("toast.sampleLoadFailed"), true);
            }
        }

        render(dom.xmlInput.value);
    });

    window.addEventListener("beforeunload", () => {
        writeStoredValue(storageKeys.diagramXml, dom.xmlInput.value);
    });

    dom.xmlInput.addEventListener(
        "input",
        debounce(() => {
            render(dom.xmlInput.value);
        }, 600)
    );

    dom.formatBtn.addEventListener("click", () => {
        render(dom.xmlInput.value);
        toast.show(t("toast.rerendered"));
    });

    dom.clearXmlBtn.addEventListener("click", () => {
        dom.xmlInput.value = "";
        writeStoredValue(storageKeys.diagramXml, "");
        render("");
    });

    dom.loadSampleBtn.addEventListener("click", () => {
        if (dom.loadingState) {
            dom.loadingState.style.display = "flex";
            const loadingLabel = dom.loadingState.querySelector("[data-i18n='viewer.loading']");
            if (loadingLabel instanceof HTMLElement) {
                loadingLabel.textContent = t("toast.resettingDiagram");
            } else {
                dom.loadingState.textContent = t("toast.resettingDiagram");
            }
        }

        window.setTimeout(async () => {
            try {
                const selectedFormat = dom.sourceFormatSelect.value;
                const preferredFormat =
                    selectedFormat === "mermaid"
                        ? "mermaid"
                        : selectedFormat === "drawio"
                          ? "drawio"
                          : getCurrentSourceFormat() === "mermaid"
                            ? "mermaid"
                            : "drawio";
                const sample = await loadExampleXml(preferredFormat);
                setSourceFormatHint(sample.sourceFormatHint);
                fillXmlAndRender(sample.content, { sourceFormatHint: sample.sourceFormatHint });
                fileNameManager.setSourceFileName(sample.fileName);
                await onSampleLoaded(sample.content);
                toast.show(t("toast.sampleLoaded"));
            } catch (_error) {
                toast.show(t("toast.sampleLoadFailed"), true);
            } finally {
                if (dom.loadingState) {
                    dom.loadingState.style.display = "none";
                }
            }
        }, 150);
    });
}

export function registerTabEvents(options) {
    const { dom, setActiveTab } = options;
    dom.editorTabBtn.addEventListener("click", () => setActiveTab("editor"));
    dom.aiTabBtn.addEventListener("click", () => setActiveTab("ai"));
    dom.versionsTabBtn.addEventListener("click", () => setActiveTab("versions"));
}

export function registerUrlEvents(options) {
    const { dom, toast, t, fetchXmlFromUrl, fillXmlAndRender, fileNameManager, setFetchLoading } = options;
    dom.fetchBtn.addEventListener("click", async () => {
        const url = dom.urlInput.value.trim();
        if (!url) {
            toast.show(t("toast.urlRequired"), true);
            return;
        }

        setFetchLoading(true);
        try {
            const xmlText = await fetchXmlFromUrl(url);
            fillXmlAndRender(xmlText);
            fileNameManager.setSourceFileName(fileNameManager.inferFileNameFromUrl(url));
            toast.show(t("toast.urlLoadSuccess"));
        } catch (_error) {
            toast.show(t("toast.urlLoadFailed"), true);
        } finally {
            setFetchLoading(false);
        }
    });
}

export function registerExportEvents(options) {
    const { dom, toast, t, drawioEditorUrl, fileNameManager } = options;
    dom.downloadXmlBtn.addEventListener("click", () => {
        const xmlText = dom.xmlInput.value.trim();
        if (!xmlText) {
            toast.show(t("toast.noXmlToDownload"), true);
            return;
        }

        triggerXmlDownload(xmlText, fileNameManager.getEffectiveExportFileName());
        toast.show(t("toast.downloadStarted"));
    });

    dom.openInDrawioBtn.addEventListener("click", () => {
        const xmlText = dom.xmlInput.value.trim();
        if (!xmlText) {
            toast.show(t("toast.noXmlToDownload"), true);
            return;
        }

        const exportFileName = fileNameManager.getEffectiveExportFileName();
        try {
            const xmlDataUrl = `data:text/xml;charset=utf-8,${encodeURIComponent(xmlText)}`;
            const drawioUrl =
                `${drawioEditorUrl}&title=${encodeURIComponent(exportFileName)}` +
                `&url=${encodeURIComponent(xmlDataUrl)}`;
            if (drawioUrl.length > 180000) {
                throw new Error("xml too large for drawio url");
            }

            const popup = window.open(drawioUrl, "_blank", "noopener,noreferrer");
            if (!popup) {
                throw new Error("popup blocked");
            }
            toast.show(t("toast.openedCurrentInDrawio"));
        } catch (error) {
            triggerXmlDownload(xmlText, exportFileName);
            window.open(drawioEditorUrl, "_blank", "noopener,noreferrer");
            if (error instanceof Error && error.message === "xml too large for drawio url") {
                toast.show(t("toast.currentXmlTooLargeForDrawioUrl"), true);
                return;
            }
            toast.show(t("toast.failedOpenDrawioWithXml"), true);
        }
    });

    dom.openDrawioLink.addEventListener("click", () => {
        toast.show(t("toast.openedDrawio"));
    });

    dom.downloadPngBtn.addEventListener("click", async () => {
        await exportDiagramAsTransparentPng({ dom, fileNameManager, toast, t });
    });
}

export function registerFileNameEvents(options) {
    const { dom, fileNameManager } = options;

    const applyCurrentFileNameInput = () => {
        fileNameManager.setSourceFileName(dom.currentFileNameInput.value, { preserveAiEditFlag: true });
    };

    dom.currentFileNameInput.addEventListener("change", applyCurrentFileNameInput);
    dom.currentFileNameInput.addEventListener("blur", applyCurrentFileNameInput);
    dom.currentFileNameInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
            return;
        }
        event.preventDefault();
        applyCurrentFileNameInput();
        dom.currentFileNameInput.blur();
    });
}

export function registerFileEvents(options) {
    const {
        dom,
        toast,
        t,
        isSupportedDiagramFile,
        readTextFile,
        fillXmlAndRender,
        fileNameManager,
        onFileLoaded = () => {}
    } = options;

    async function handleFile(file) {
        if (!isSupportedDiagramFile(file.name)) {
            toast.show(t("toast.unsupportedFile"), true);
            return;
        }

        try {
            const text = await readTextFile(file);
            onFileLoaded(file, text);
            fillXmlAndRender(text);
            fileNameManager.setSourceFileName(file.name);
            toast.show(`${t("toast.fileLoaded")}: ${file.name}`);
        } catch (_error) {
            toast.show(t("toast.fileReadError"), true);
        }
    }

    dom.uploadBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        dom.fileInput.click();
    });

    dom.dropzone.addEventListener("click", () => dom.fileInput.click());

    const handleFileSelectionEvent = async (event) => {
        const file = event.target.files?.[0];
        if (file) {
            await handleFile(file);
        }
        event.target.value = "";
    };

    dom.fileInput.addEventListener("change", handleFileSelectionEvent);
    dom.fileInput.addEventListener("input", handleFileSelectionEvent);

    const preventDefaults = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, preventDefaults);
        document.body.addEventListener(eventName, preventDefaults);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, () => {
            dom.dropzone.classList.add("border-blue-500", "bg-blue-50");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, () => {
            dom.dropzone.classList.remove("border-blue-500", "bg-blue-50");
        });
    });

    dom.dropzone.addEventListener("drop", async (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            await handleFile(file);
        }
    });
}
