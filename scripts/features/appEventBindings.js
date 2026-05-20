import { getEmbeddedNotoSansTcFontDataUri } from "../services/fontEmbedService.js";

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
const PNG_EXPORT_MAX_EDGE = 8192;
const PNG_EXPORT_MAX_PIXELS = 30000000;

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

    const maxEdge = PNG_EXPORT_MAX_EDGE;
    const largerEdge = Math.max(width, height);
    if (largerEdge > maxEdge) {
        const scale = maxEdge / largerEdge;
        width = Math.max(1, Math.floor(width * scale));
        height = Math.max(1, Math.floor(height * scale));
    }

    return { width, height };
}

function resolveHighResolutionExportDimensions(baseWidth, baseHeight, sourceFormat) {
    const isMermaid = sourceFormat.includes("mermaid");
    const baseScale = isMermaid ? 6 : 6;
    const minLongEdge = isMermaid ? 3000 : 3000;
    const safeWidth = Math.max(1, baseWidth);
    const safeHeight = Math.max(1, baseHeight);

    let scale = baseScale;
    const currentLongEdge = Math.max(safeWidth, safeHeight);
    scale = Math.max(scale, minLongEdge / currentLongEdge);

    let width = Math.max(1, Math.round(safeWidth * scale));
    let height = Math.max(1, Math.round(safeHeight * scale));

    const largerEdge = Math.max(width, height);
    if (largerEdge > PNG_EXPORT_MAX_EDGE) {
        const edgeScale = PNG_EXPORT_MAX_EDGE / largerEdge;
        width = Math.max(1, Math.floor(width * edgeScale));
        height = Math.max(1, Math.floor(height * edgeScale));
    }

    const totalPixels = width * height;
    if (totalPixels > PNG_EXPORT_MAX_PIXELS) {
        const pixelScale = Math.sqrt(PNG_EXPORT_MAX_PIXELS / totalPixels);
        width = Math.max(1, Math.floor(width * pixelScale));
        height = Math.max(1, Math.floor(height * pixelScale));
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

function sanitizeSvgForCanvasExport(svgElement, options = {}) {
    const { embeddedFontDataUri = "" } = options;
    // Remove <style> nodes that reference external resources (@font-face / @import)
    // since loading them while rasterizing the SVG taints the canvas and blocks
    // toBlob/toDataURL.
    const styleNodes = Array.from(svgElement.querySelectorAll("style"));
    styleNodes.forEach((styleNode) => {
        const css = String(styleNode.textContent || "");
        const referencesExternal =
            /@import/i.test(css) ||
            /url\(\s*['"]?(https?:|\/\/)/i.test(css);
        if (referencesExternal) {
            styleNode.remove();
        }
    });

    // Inject a style block that pins every text node to system fonts. Draw.io
    // renders text inside <foreignObject> using whatever font-family is set on
    // the HTML, which the browser will then fetch from external CDNs while
    // rasterizing the SVG (this is what taints the canvas). Forcing a generic
    // sans-serif keeps the text visible without triggering any external font
    // download.
    const fontGuardStyle = document.createElementNS("http://www.w3.org/2000/svg", "style");
    const embeddedFontFaceCss = embeddedFontDataUri
        ? "@font-face { font-family: 'Embedded Noto Sans TC'; font-style: normal; font-weight: 100 900; src: url('" +
          embeddedFontDataUri +
          "') format('truetype'); }\n"
        : "";
    const preferredFamily = embeddedFontDataUri ? "'Embedded Noto Sans TC', " : "";
    fontGuardStyle.textContent =
        embeddedFontFaceCss +
        `*, *::before, *::after { font-family: ${preferredFamily}'Noto Sans TC', 'Noto Sans CJK TC', 'PingFang TC', 'Microsoft JhengHei', 'Heiti TC', sans-serif !important; }`;
    svgElement.insertBefore(fontGuardStyle, svgElement.firstChild);

    // Strip inline font-family declarations that might still point at external
    // web fonts. This catches both `font-family` style attributes on SVG nodes
    // and font-family rules embedded inside foreignObject HTML content.
    const elementsWithStyle = Array.from(svgElement.querySelectorAll("[style]"));
    elementsWithStyle.forEach((node) => {
        const style = String(node.getAttribute("style") || "");
        if (!style) {
            return;
        }
        const cleaned = style.replace(/font-family\s*:[^;]*;?/gi, "").trim();
        if (cleaned !== style) {
            if (cleaned) {
                node.setAttribute("style", cleaned);
            } else {
                node.removeAttribute("style");
            }
        }
    });
    const elementsWithFontFamilyAttr = Array.from(
        svgElement.querySelectorAll("[font-family]")
    );
    elementsWithFontFamilyAttr.forEach((node) => {
        node.removeAttribute("font-family");
    });

    const elementsWithExternalRefs = Array.from(
        svgElement.querySelectorAll("[href], [*|href]")
    );
    elementsWithExternalRefs.forEach((node) => {
        const candidateHrefs = [
            node.getAttribute("href"),
            node.getAttribute("xlink:href"),
            node.getAttributeNS("http://www.w3.org/1999/xlink", "href")
        ];
        const isExternal = candidateHrefs.some((value) => {
            const normalized = String(value || "").trim().toLowerCase();
            return (
                normalized.startsWith("http://") ||
                normalized.startsWith("https://") ||
                normalized.startsWith("//")
            );
        });
        if (isExternal) {
            node.removeAttribute("href");
            node.removeAttribute("xlink:href");
            try {
                node.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
            } catch (_error) {
                // Ignore: not all environments support removeAttributeNS uniformly.
            }
        }
    });
}

function trimCanvasTransparentEdges(canvas, padding = 2, alphaThreshold = 1) {
    const context = canvas.getContext("2d");
    if (!context) {
        return canvas;
    }

    let imageData = null;
    try {
        imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    } catch (_error) {
        // Tainted canvas cannot be inspected; return original.
        return canvas;
    }

    const { data, width, height } = imageData;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha < alphaThreshold) {
                continue;
            }
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    if (maxX < minX || maxY < minY) {
        return canvas;
    }

    const left = Math.max(0, minX - padding);
    const top = Math.max(0, minY - padding);
    const right = Math.min(width - 1, maxX + padding);
    const bottom = Math.min(height - 1, maxY + padding);
    const trimmedWidth = right - left + 1;
    const trimmedHeight = bottom - top + 1;

    if (
        trimmedWidth <= 0 ||
        trimmedHeight <= 0 ||
        (trimmedWidth === width && trimmedHeight === height)
    ) {
        return canvas;
    }

    const trimmedCanvas = document.createElement("canvas");
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const trimmedContext = trimmedCanvas.getContext("2d");
    if (!trimmedContext) {
        return canvas;
    }
    trimmedContext.putImageData(context.getImageData(left, top, trimmedWidth, trimmedHeight), 0, 0);
    return trimmedCanvas;
}

async function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }
                reject(new Error("png encoding failed"));
            }, "image/png");
        } catch (error) {
            reject(error);
        }
    });
}

async function blobToImageBitmap(blob) {
    if (typeof window.createImageBitmap === "function") {
        try {
            return await window.createImageBitmap(blob);
        } catch (_error) {
            // Fall through to Image-based decode.
        }
    }

    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.decoding = "sync";
        image.src = url;
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });
        return image;
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function normalizePngBlobBounds(pngBlob, { padding = 2, alphaThreshold = 1 } = {}) {
    const drawable = await blobToImageBitmap(pngBlob);
    const width = Math.max(1, Math.floor(drawable.width || 1));
    const height = Math.max(1, Math.floor(drawable.height || 1));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        return pngBlob;
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(drawable, 0, 0, width, height);
    if (typeof drawable.close === "function") {
        drawable.close();
    }

    const trimmedCanvas = trimCanvasTransparentEdges(canvas, padding, alphaThreshold);
    return canvasToPngBlob(trimmedCanvas);
}

async function dataUrlToBlob(dataUrl) {
    const response = await window.fetch(dataUrl);
    if (!response.ok) {
        throw new Error("failed to convert data url");
    }
    return response.blob();
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

function buildTransparentSvgMarkup(sourceSvg, options = {}) {
    const { targetWidth = null, targetHeight = null, embeddedFontDataUri = "" } = options;
    const { width: naturalWidth, height: naturalHeight } = resolveSvgExportDimensions(sourceSvg);
    const renderWidth = Math.max(
        1,
        Math.floor(parseNumericAttribute(targetWidth) || naturalWidth || 1)
    );
    const renderHeight = Math.max(
        1,
        Math.floor(parseNumericAttribute(targetHeight) || naturalHeight || 1)
    );
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

    // Ensure the viewBox uses the SVG's natural coordinate system so the
    // existing content keeps its proportions, then enlarge width/height so the
    // browser rasterizes the SVG at high resolution when loaded via <img>.
    if (!exportSvg.getAttribute("viewBox")) {
        exportSvg.setAttribute("viewBox", `0 0 ${naturalWidth} ${naturalHeight}`);
    }
    exportSvg.setAttribute("width", String(renderWidth));
    exportSvg.setAttribute("height", String(renderHeight));
    exportSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    stripCrossOriginImageNodes(exportSvg);
    sanitizeSvgForCanvasExport(exportSvg, { embeddedFontDataUri });
    removeFullCanvasBackgroundRect(exportSvg, naturalWidth, naturalHeight);
    return new XMLSerializer().serializeToString(exportSvg);
}

async function drawSvgBlobToCanvas(canvas, context, svgBlob) {
    // We intentionally avoid createImageBitmap here. Some browsers rasterize the
    // SVG once at a low intrinsic size and then drawImage upscales that bitmap,
    // producing blurry output. Using an <img> element keeps the SVG as a vector
    // source so drawImage can rasterize it directly at the target canvas size.
    const renderFromUrl = async (url) => {
        const image = new Image();
        image.decoding = "sync";
        image.src = url;
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };

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
        const sourceFormat = String(dom.currentSourceModeBadge?.textContent || "").toLowerCase();
        const trimPadding = sourceFormat.includes("mermaid") ? 8 : 4;
        const { width: baseExportWidth, height: baseExportHeight } = resolveSvgExportDimensions(sourceSvg);
        const { width: exportWidth, height: exportHeight } = resolveHighResolutionExportDimensions(
            baseExportWidth,
            baseExportHeight,
            sourceFormat
        );
        let embeddedFontDataUri = "";
        try {
            embeddedFontDataUri = await getEmbeddedNotoSansTcFontDataUri();
        } catch (_fontLoadError) {
            // Embedded font is optional; rasterization will fall back to system fonts.
        }
        const svgMarkup = buildTransparentSvgMarkup(sourceSvg, {
            targetWidth: exportWidth,
            targetHeight: exportHeight,
            embeddedFontDataUri
        });
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
            const trimmedCanvas = trimCanvasTransparentEdges(
                canvas,
                trimPadding,
                2
            );
            try {
                // Keep canvas alpha channel untouched to export transparent background PNG.
                pngBlob = await canvasToPngBlob(trimmedCanvas);
            } catch (_canvasExportError) {
                // canvas.toBlob can throw SecurityError when the canvas is tainted
                // by cross-origin resources rendered into the SVG; fall through to
                // the html-to-image renderer which performs its own inlining.
                pngBlob = null;
            }
        }

        if (!pngBlob) {
            try {
                const module = await loadHtmlToImageModule();
                // Render the enlarged stand-alone SVG markup off-screen instead of the
                // live DOM SVG (which is currently transformed by pan/zoom). This keeps
                // the fallback at the same high resolution as the main path.
                const offscreenHost = document.createElement("div");
                offscreenHost.style.position = "fixed";
                offscreenHost.style.left = "-99999px";
                offscreenHost.style.top = "0";
                offscreenHost.style.pointerEvents = "none";
                offscreenHost.style.background = "transparent";
                offscreenHost.style.width = `${exportWidth}px`;
                offscreenHost.style.height = `${exportHeight}px`;
                offscreenHost.innerHTML = svgMarkup;
                document.body.appendChild(offscreenHost);
                const offscreenSvg = offscreenHost.querySelector("svg");
                if (offscreenSvg instanceof Element) {
                    offscreenSvg.setAttribute("width", String(exportWidth));
                    offscreenSvg.setAttribute("height", String(exportHeight));
                    offscreenSvg.style.width = `${exportWidth}px`;
                    offscreenSvg.style.height = `${exportHeight}px`;
                }
                // html-to-image tends to render SVG element content at roughly half of
                // the requested canvas size in some browsers. Bump pixelRatio so the
                // produced bitmap still hits the target dimensions.
                const fallbackPixelRatio = 3;
                try {
                    if (offscreenSvg && typeof module?.toBlob === "function") {
                        pngBlob = await module.toBlob(offscreenSvg, {
                            cacheBust: true,
                            backgroundColor: "rgba(0,0,0,0)",
                            pixelRatio: fallbackPixelRatio,
                            width: exportWidth,
                            height: exportHeight,
                            canvasWidth: exportWidth,
                            canvasHeight: exportHeight,
                            skipAutoScale: true,
                            style: {
                                transform: "none",
                                background: "transparent",
                                backgroundColor: "transparent"
                            }
                        });
                    }
                    if (!pngBlob && offscreenSvg && typeof module?.toPng === "function") {
                        const dataUrl = await module.toPng(offscreenSvg, {
                            cacheBust: true,
                            backgroundColor: "rgba(0,0,0,0)",
                            pixelRatio: fallbackPixelRatio,
                            width: exportWidth,
                            height: exportHeight,
                            canvasWidth: exportWidth,
                            canvasHeight: exportHeight,
                            skipAutoScale: true
                        });
                        pngBlob = await dataUrlToBlob(dataUrl);
                    }
                } finally {
                    offscreenHost.remove();
                }
            } catch (_fallbackError) {
                pngBlob = null;
            }
        }

        if (pngBlob) {
            try {
                pngBlob = await normalizePngBlobBounds(pngBlob, {
                    padding: trimPadding,
                    alphaThreshold: 2
                });
            } catch (_normalizeError) {
                // Keep the un-normalized blob if trimming fails for any reason.
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

    if (dom.downloadPngFloatingBtn) {
        dom.downloadPngFloatingBtn.addEventListener("click", () => {
            dom.downloadPngBtn.click();
        });
    }

    dom.downloadPngBtn.addEventListener("click", async () => {
        const overlay = dom.pngExportLoadingOverlay;
        const showOverlay = () => {
            if (!overlay) {
                return;
            }
            overlay.classList.remove("hidden");
            overlay.classList.add("flex");
        };
        const hideOverlay = () => {
            if (!overlay) {
                return;
            }
            overlay.classList.add("hidden");
            overlay.classList.remove("flex");
        };

        dom.downloadPngBtn.disabled = true;
        dom.downloadPngBtn.classList.add("opacity-75", "cursor-not-allowed");
        if (dom.downloadPngFloatingBtn) {
            dom.downloadPngFloatingBtn.disabled = true;
            dom.downloadPngFloatingBtn.classList.add("opacity-75", "cursor-not-allowed");
        }
        showOverlay();

        // Yield two animation frames so the overlay actually paints before the
        // synchronous canvas rasterization work begins on the main thread.
        await new Promise((resolve) =>
            window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
        );

        try {
            await exportDiagramAsTransparentPng({ dom, fileNameManager, toast, t });
        } finally {
            hideOverlay();
            dom.downloadPngBtn.disabled = false;
            dom.downloadPngBtn.classList.remove("opacity-75", "cursor-not-allowed");
            if (dom.downloadPngFloatingBtn) {
                dom.downloadPngFloatingBtn.disabled = false;
                dom.downloadPngFloatingBtn.classList.remove("opacity-75", "cursor-not-allowed");
            }
        }
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
