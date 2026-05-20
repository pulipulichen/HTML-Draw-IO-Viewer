let html2canvasModulePromise = null;

async function loadHtml2CanvasModule() {
    if (!html2canvasModulePromise) {
        html2canvasModulePromise = import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm");
    }
    return html2canvasModulePromise;
}

function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
}

function waitImageLoaded(image) {
    return new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("image load failed"));
    });
}

function normalizePoint(clientX, clientY, containerRect) {
    return {
        x: Math.max(0, Math.min(clientX - containerRect.left, containerRect.width)),
        y: Math.max(0, Math.min(clientY - containerRect.top, containerRect.height))
    };
}

function polygonFromRect(start, end) {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    return [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom }
    ];
}

function getPolygonBounds(points) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    points.forEach((point) => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    });

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(0, maxX - minX),
        height: Math.max(0, maxY - minY)
    };
}

function isPolygonLargeEnough(points, minSelectionSize) {
    if (!points || points.length < 3) {
        return false;
    }
    const bounds = getPolygonBounds(points);
    return bounds.width >= minSelectionSize && bounds.height >= minSelectionSize;
}

function areBoundsIntersected(a, b) {
    return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

function isPointNear(pointA, pointB, threshold = 10) {
    const dx = pointA.x - pointB.x;
    const dy = pointA.y - pointB.y;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
}

function drawPolygonsOnContext(ctx, polygons, style) {
    polygons.forEach((polygon) => {
        if (!polygon.points.length) {
            return;
        }
        ctx.beginPath();
        ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
        for (let i = 1; i < polygon.points.length; i += 1) {
            ctx.lineTo(polygon.points[i].x, polygon.points[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = style.fillStyle;
        ctx.strokeStyle = style.strokeStyle;
        ctx.lineWidth = style.lineWidth;
        ctx.fill();
        ctx.stroke();
    });
}

function buildPolygonPath(points) {
    if (!points.length) {
        return "";
    }
    const [first, ...rest] = points;
    const path = [`M ${first.x} ${first.y}`];
    rest.forEach((point) => {
        path.push(`L ${point.x} ${point.y}`);
    });
    path.push("Z");
    return path.join(" ");
}

function toDataUrlFromSvg(svgText) {
    return `data:image/svg+xml;base64,${utf8ToBase64(svgText)}`;
}

function createFallbackBlankCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return canvas;
}

function isCanvasTainted(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return true;
    }
    try {
        ctx.getImageData(0, 0, 1, 1);
        return false;
    } catch (_error) {
        return true;
    }
}

function safeCanvasToDataUrl(canvas, mimeType = "image/png") {
    try {
        return canvas.toDataURL(mimeType);
    } catch (_error) {
        return null;
    }
}

export function createSelectionController({
    dom,
    t,
    showToast,
    onSelectionCaptured,
    minSelectionSize = 12
}) {
    let isSelectionMode = false;
    let isDrawing = false;
    let selectionPointerId = null;
    let selectedRegionImage = null;
    let highlightMode = "rect";
    let highlightAction = "add";
    let draftStartPoint = null;
    let draftPolygon = null;
    let draftFreehandPoints = [];
    let polygonDraftPoints = [];
    let highlights = [];
    let highlightIdSeed = 1;

    function getOrCreateSelectionBox() {
        let selectionBox = dom.viewerContainer.querySelector("#selectionBox");
        if (selectionBox instanceof HTMLElement) {
            return selectionBox;
        }

        selectionBox = document.createElement("div");
        selectionBox.id = "selectionBox";
        selectionBox.className = "hidden absolute border-2 border-amber-500 bg-amber-200/20 pointer-events-none z-30";
        dom.viewerContainer.appendChild(selectionBox);
        return selectionBox;
    }

    function getOrCreateHighlightCanvas() {
        let canvas = dom.viewerContainer.querySelector("#highlightCanvas");
        if (canvas instanceof HTMLCanvasElement) {
            return canvas;
        }

        canvas = document.createElement("canvas");
        canvas.id = "highlightCanvas";
        canvas.className = "absolute inset-0 pointer-events-none z-20";
        dom.viewerContainer.appendChild(canvas);
        return canvas;
    }

    function resizeHighlightCanvasIfNeeded(canvas) {
        const rect = dom.viewerContainer.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(rect.width * ratio));
        const height = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return { ratio };
    }

    function clearSelectionBox() {
        const selectionBox = getOrCreateSelectionBox();
        selectionBox.classList.add("hidden");
        selectionBox.style.width = "0px";
        selectionBox.style.height = "0px";
    }

    function releaseSelectionPointerCapture() {
        if (selectionPointerId === null) {
            return;
        }

        if (dom.viewerContainer.hasPointerCapture(selectionPointerId)) {
            dom.viewerContainer.releasePointerCapture(selectionPointerId);
        }
        selectionPointerId = null;
    }

    function setSelectionButtonsState() {
        const activateAdd = isSelectionMode && highlightAction === "add";
        dom.addHighlightBtn.classList.toggle("bg-blue-600", activateAdd);
        dom.addHighlightBtn.classList.toggle("text-white", activateAdd);
        dom.addHighlightBtn.classList.toggle("border-blue-600", activateAdd);
        dom.addHighlightBtn.classList.toggle("hover:bg-blue-700", activateAdd);
        dom.addHighlightBtn.classList.toggle("bg-white", !activateAdd);
        dom.addHighlightBtn.classList.toggle("text-slate-700", !activateAdd);
        dom.addHighlightBtn.classList.toggle("border-slate-300", !activateAdd);
        dom.addHighlightBtn.classList.toggle("hover:bg-slate-100", !activateAdd);

        const activateErase = isSelectionMode && highlightAction === "erase";
        dom.eraseHighlightBtn.classList.toggle("bg-rose-600", activateErase);
        dom.eraseHighlightBtn.classList.toggle("text-white", activateErase);
        dom.eraseHighlightBtn.classList.toggle("border-rose-600", activateErase);
        dom.eraseHighlightBtn.classList.toggle("hover:bg-rose-700", activateErase);
        dom.eraseHighlightBtn.classList.toggle("bg-white", !activateErase);
        dom.eraseHighlightBtn.classList.toggle("text-slate-700", !activateErase);
        dom.eraseHighlightBtn.classList.toggle("border-slate-300", !activateErase);
        dom.eraseHighlightBtn.classList.toggle("hover:bg-slate-100", !activateErase);
        dom.highlightModeSelect.classList.toggle("ring-2", isSelectionMode);
        dom.highlightModeSelect.classList.toggle("ring-emerald-400", isSelectionMode);
    }

    function renderSelectedRegionPreview() {
        const hasImage = Boolean(selectedRegionImage);
        dom.selectedRegionEmpty.classList.toggle("hidden", hasImage);
        dom.selectedRegionPreviewWrap.classList.toggle("hidden", !hasImage);

        if (!hasImage) {
            dom.selectedRegionPreview.removeAttribute("src");
            dom.selectedRegionMeta.textContent = "";
            setSelectionButtonsState();
            return;
        }

        dom.selectedRegionPreview.src = selectedRegionImage.highlightedImage?.dataUrl || selectedRegionImage.dataUrl;
        dom.selectedRegionMeta.textContent =
            `${selectedRegionImage.width} x ${selectedRegionImage.height}px · ${selectedRegionImage.highlightCount} highlights`;
        setSelectionButtonsState();
    }

    function renderHighlightOverlay() {
        const canvas = getOrCreateHighlightCanvas();
        const { ratio } = resizeHighlightCanvasIfNeeded(canvas);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        drawPolygonsOnContext(ctx, highlights, {
            fillStyle: "rgba(250, 204, 21, 0.24)",
            strokeStyle: "rgba(217, 119, 6, 0.95)",
            lineWidth: 2
        });

        if (draftPolygon && draftPolygon.length >= 2) {
            drawPolygonsOnContext(ctx, [{ points: draftPolygon }], {
                fillStyle: highlightAction === "add" ? "rgba(14, 165, 233, 0.15)" : "rgba(244, 63, 94, 0.15)",
                strokeStyle: highlightAction === "add" ? "rgba(14, 116, 144, 0.95)" : "rgba(225, 29, 72, 0.95)",
                lineWidth: 2
            });
        }
    }

    function getRenderedSvgElement() {
        const svgCandidates = Array.from(dom.viewerContainer.querySelectorAll("svg"));
        if (!svgCandidates.length) {
            return null;
        }

        const containerRect = dom.viewerContainer.getBoundingClientRect();
        let bestMatch = null;
        let bestArea = 0;

        svgCandidates.forEach((candidate) => {
            if (!(candidate instanceof SVGElement)) {
                return;
            }

            const rect = candidate.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                return;
            }

            const intersectsContainer =
                rect.right > containerRect.left &&
                rect.left < containerRect.right &&
                rect.bottom > containerRect.top &&
                rect.top < containerRect.bottom;
            if (!intersectsContainer) {
                return;
            }

            const area = rect.width * rect.height;
            if (area > bestArea) {
                bestArea = area;
                bestMatch = candidate;
            }
        });

        return bestMatch;
    }

    function buildComposedSnapshotSvg(containerRect, svgElement, svgRect, polygons) {
        const baseSvg = serializeSvgForExport(svgElement, svgRect.width, svgRect.height);
        const baseSvgBase64 = utf8ToBase64(baseSvg);
        const offsetX = svgRect.left - containerRect.left;
        const offsetY = svgRect.top - containerRect.top;
        const polygonMarkup = polygons
            .map((polygon) => {
                const path = buildPolygonPath(polygon.points);
                if (!path) {
                    return "";
                }
                return `<path d="${path}" fill="rgba(250,204,21,0.32)" stroke="rgba(217,119,6,1)" stroke-width="2"/>`;
            })
            .join("");

        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${containerRect.width}" height="${containerRect.height}" viewBox="0 0 ${containerRect.width} ${containerRect.height}">` +
            `<rect x="0" y="0" width="${containerRect.width}" height="${containerRect.height}" fill="#ffffff"/>` +
            `<image href="data:image/svg+xml;base64,${baseSvgBase64}" x="${offsetX}" y="${offsetY}" width="${svgRect.width}" height="${svgRect.height}"/>` +
            polygonMarkup +
            `</svg>`
        );
    }

    function buildSvgSnapshotContext() {
        const svgElement = getRenderedSvgElement();
        if (!(svgElement instanceof SVGElement)) {
            throw new Error("no svg");
        }

        const containerRect = dom.viewerContainer.getBoundingClientRect();
        const svgRect = svgElement.getBoundingClientRect();
        if (!svgRect.width || !svgRect.height) {
            throw new Error("svg size invalid");
        }

        const fullSvg = serializeSvgForExport(svgElement, svgRect.width, svgRect.height);
        const highlightedClone = svgElement.cloneNode(true);
        if (!(highlightedClone instanceof SVGElement)) {
            throw new Error("svg clone failed");
        }
        if (!highlightedClone.getAttribute("xmlns")) {
            highlightedClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        if (!highlightedClone.getAttribute("xmlns:xlink")) {
            highlightedClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        }
        highlightedClone.setAttribute("width", String(Math.max(1, Math.round(svgRect.width))));
        highlightedClone.setAttribute("height", String(Math.max(1, Math.round(svgRect.height))));
        if (!highlightedClone.getAttribute("viewBox")) {
            highlightedClone.setAttribute("viewBox", `0 0 ${Math.max(1, svgRect.width)} ${Math.max(1, svgRect.height)}`);
        }

        const highlightLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        highlightLayer.setAttribute("data-role", "highlight-overlay");
        highlights.forEach((polygon) => {
            const localPoints = polygon.points.map((point) => ({
                x: point.x - (svgRect.left - containerRect.left),
                y: point.y - (svgRect.top - containerRect.top)
            }));
            const pathValue = buildPolygonPath(localPoints);
            if (!pathValue) {
                return;
            }
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathValue);
            path.setAttribute("fill", "rgba(250,204,21,0.32)");
            path.setAttribute("stroke", "rgba(217,119,6,1)");
            path.setAttribute("stroke-width", "2");
            highlightLayer.appendChild(path);
        });
        highlightedClone.appendChild(highlightLayer);
        const highlightedSvg = new XMLSerializer().serializeToString(highlightedClone);

        return {
            fullImage: {
                mimeType: "image/svg+xml",
                dataUrl: toDataUrlFromSvg(fullSvg),
                width: Math.max(1, Math.round(svgRect.width)),
                height: Math.max(1, Math.round(svgRect.height))
            },
            highlightedImage: {
                mimeType: "image/svg+xml",
                dataUrl: toDataUrlFromSvg(highlightedSvg),
                width: Math.max(1, Math.round(svgRect.width)),
                height: Math.max(1, Math.round(svgRect.height))
            }
        };
    }

    async function drawSvgStringToCanvas(svgString, width, height, ratio) {
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const svgBlobUrl = URL.createObjectURL(svgBlob);
        try {
            const image = new Image();
            image.src = svgBlobUrl;
            await waitImageLoaded(image);
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * ratio));
            canvas.height = Math.max(1, Math.round(height * ratio));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                throw new Error("canvas context unavailable");
            }
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas;
        } finally {
            URL.revokeObjectURL(svgBlobUrl);
        }
    }

    async function captureViewerFromComposedSvg() {
        const svgElement = getRenderedSvgElement();
        if (!(svgElement instanceof SVGElement)) {
            throw new Error("no svg");
        }

        const containerRect = dom.viewerContainer.getBoundingClientRect();
        const svgRect = svgElement.getBoundingClientRect();
        if (!containerRect.width || !containerRect.height || !svgRect.width || !svgRect.height) {
            throw new Error("invalid size");
        }

        const ratio = window.devicePixelRatio || 1;
        const fullSvg = buildComposedSnapshotSvg(containerRect, svgElement, svgRect, []);
        const highlightedSvg = buildComposedSnapshotSvg(containerRect, svgElement, svgRect, highlights);
        const fullCanvas = await drawSvgStringToCanvas(fullSvg, containerRect.width, containerRect.height, ratio);
        const highlightedCanvas = await drawSvgStringToCanvas(
            highlightedSvg,
            containerRect.width,
            containerRect.height,
            ratio
        );
        return {
            fullCanvas,
            highlightedCanvas
        };
    }

    function serializeSvgForExport(svgElement, width, height) {
        const clonedSvg = svgElement.cloneNode(true);
        if (!(clonedSvg instanceof SVGElement)) {
            throw new Error("svg clone failed");
        }

        if (!clonedSvg.getAttribute("xmlns")) {
            clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        if (!clonedSvg.getAttribute("xmlns:xlink")) {
            clonedSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        }

        clonedSvg.setAttribute("width", String(Math.max(1, Math.round(width))));
        clonedSvg.setAttribute("height", String(Math.max(1, Math.round(height))));
        if (!clonedSvg.getAttribute("viewBox")) {
            clonedSvg.setAttribute("viewBox", `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`);
        }

        return new XMLSerializer().serializeToString(clonedSvg);
    }

    async function captureViewerFromSvg() {
        const svgElement = getRenderedSvgElement();
        if (!(svgElement instanceof SVGElement)) {
            throw new Error("no svg");
        }

        const containerRect = dom.viewerContainer.getBoundingClientRect();
        const svgRect = svgElement.getBoundingClientRect();
        if (!containerRect.width || !containerRect.height || !svgRect.width || !svgRect.height) {
            throw new Error("invalid size");
        }

        const serializedSvg = serializeSvgForExport(svgElement, svgRect.width, svgRect.height);
        const svgBlob = new Blob([serializedSvg], { type: "image/svg+xml;charset=utf-8" });
        const svgBlobUrl = URL.createObjectURL(svgBlob);

        try {
            const image = new Image();
            image.src = svgBlobUrl;
            await waitImageLoaded(image);

            const ratio = window.devicePixelRatio || 1;
            const fullCanvas = document.createElement("canvas");
            fullCanvas.width = Math.max(1, Math.round(containerRect.width * ratio));
            fullCanvas.height = Math.max(1, Math.round(containerRect.height * ratio));

            const ctx = fullCanvas.getContext("2d");
            if (!ctx) {
                throw new Error("canvas context unavailable");
            }

            // keep a deterministic background so the full-map snapshot is always visible
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

            const offsetX = (svgRect.left - containerRect.left) * ratio;
            const offsetY = (svgRect.top - containerRect.top) * ratio;
            const drawWidth = svgRect.width * ratio;
            const drawHeight = svgRect.height * ratio;

            ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
            return fullCanvas;
        } finally {
            URL.revokeObjectURL(svgBlobUrl);
        }
    }

    async function captureViewerFromSvgDataUrl() {
        const svgElement = getRenderedSvgElement();
        if (!(svgElement instanceof SVGElement)) {
            throw new Error("no svg");
        }

        const containerRect = dom.viewerContainer.getBoundingClientRect();
        const svgRect = svgElement.getBoundingClientRect();
        if (!containerRect.width || !containerRect.height || !svgRect.width || !svgRect.height) {
            throw new Error("invalid size");
        }

        const serializedSvg = serializeSvgForExport(svgElement, svgRect.width, svgRect.height);
        const encoded = utf8ToBase64(serializedSvg);
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${encoded}`;
        await waitImageLoaded(image);

        const ratio = window.devicePixelRatio || 1;
        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = Math.max(1, Math.round(containerRect.width * ratio));
        fullCanvas.height = Math.max(1, Math.round(containerRect.height * ratio));
        const ctx = fullCanvas.getContext("2d");
        if (!ctx) {
            throw new Error("canvas context unavailable");
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
        const offsetX = (svgRect.left - containerRect.left) * ratio;
        const offsetY = (svgRect.top - containerRect.top) * ratio;
        const drawWidth = svgRect.width * ratio;
        const drawHeight = svgRect.height * ratio;
        ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
        return fullCanvas;
    }

    async function captureSvgOnlyFallback() {
        const svgElement = getRenderedSvgElement();
        if (!(svgElement instanceof SVGElement)) {
            throw new Error("no svg");
        }

        const svgRect = svgElement.getBoundingClientRect();
        if (!svgRect.width || !svgRect.height) {
            throw new Error("svg size invalid");
        }

        const serializedSvg = serializeSvgForExport(svgElement, svgRect.width, svgRect.height);
        const svgBlob = new Blob([serializedSvg], { type: "image/svg+xml;charset=utf-8" });
        const svgBlobUrl = URL.createObjectURL(svgBlob);

        try {
            const image = new Image();
            image.src = svgBlobUrl;
            await waitImageLoaded(image);

            const ratio = window.devicePixelRatio || 1;
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(svgRect.width * ratio));
            canvas.height = Math.max(1, Math.round(svgRect.height * ratio));
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                throw new Error("canvas context unavailable");
            }
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas;
        } finally {
            URL.revokeObjectURL(svgBlobUrl);
        }
    }

    async function captureDiagramLayerWithHtml2Canvas() {
        const html2canvasModule = await loadHtml2CanvasModule();
        const html2canvas = html2canvasModule.default;
        const diagramLayer =
            dom.viewerContainer.querySelector("[data-viewer-role='diagram-host']") ||
            dom.viewerContainer.querySelector(".mxgraph") ||
            getRenderedSvgElement();
        if (!(diagramLayer instanceof Element)) {
            throw new Error("diagram layer not found");
        }

        const containerRect = dom.viewerContainer.getBoundingClientRect();
        const layerRect = diagramLayer.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const layerCanvas = await html2canvas(diagramLayer, {
            backgroundColor: null,
            useCORS: true,
            logging: false,
            scale: ratio
        });

        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = Math.max(1, Math.round(containerRect.width * ratio));
        fullCanvas.height = Math.max(1, Math.round(containerRect.height * ratio));
        const ctx = fullCanvas.getContext("2d");
        if (!ctx) {
            throw new Error("canvas context unavailable");
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
        const drawX = Math.round((layerRect.left - containerRect.left) * ratio);
        const drawY = Math.round((layerRect.top - containerRect.top) * ratio);
        ctx.drawImage(layerCanvas, drawX, drawY);
        return fullCanvas;
    }

    async function captureViewerWithoutOverlay() {
        try {
            return await captureViewerFromSvg();
        } catch (svgError) {
            console.warn("SVG 全圖擷取失敗，嘗試 SVG-only fallback:", svgError);
            try {
                return await captureViewerFromSvgDataUrl();
            } catch (svgDataUrlError) {
                console.warn("SVG dataURL 擷取失敗，嘗試 SVG-only fallback:", svgDataUrlError);
            }
            try {
                return await captureSvgOnlyFallback();
            } catch (svgOnlyError) {
                console.warn("SVG-only fallback 失敗，改用 html2canvas (diagram-layer):", svgOnlyError);
            }

            try {
                return await captureDiagramLayerWithHtml2Canvas();
            } catch (diagramLayerError) {
                console.warn("diagram-layer html2canvas 失敗，改用 viewer html2canvas:", diagramLayerError);
            }

            const html2canvasModule = await loadHtml2CanvasModule();
            const html2canvas = html2canvasModule.default;
            const selectionBox = getOrCreateSelectionBox();
            const overlayCanvas = getOrCreateHighlightCanvas();
            const hiddenNodes = [];

            [selectionBox, overlayCanvas].forEach((node) => {
                if (!node.classList.contains("hidden")) {
                    node.classList.add("hidden");
                    hiddenNodes.push(node);
                }
            });

            try {
                return await html2canvas(dom.viewerContainer, {
                    backgroundColor: null,
                    useCORS: true,
                    logging: false,
                    scale: window.devicePixelRatio || 1,
                    ignoreElements: (element) =>
                        element.id === "selectionBox" || element.id === "highlightCanvas" || element.id === "toast" || element.id === "loadingState"
                });
            } finally {
                hiddenNodes.forEach((node) => node.classList.remove("hidden"));
            }
        }
    }

    function buildHighlightedCanvas(fullCanvas) {
        const highlightedCanvas = document.createElement("canvas");
        highlightedCanvas.width = fullCanvas.width;
        highlightedCanvas.height = fullCanvas.height;
        const ctx = highlightedCanvas.getContext("2d");
        if (!ctx) {
            throw new Error("highlight canvas context unavailable");
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, highlightedCanvas.width, highlightedCanvas.height);
        if (!isCanvasTainted(fullCanvas)) {
            ctx.drawImage(fullCanvas, 0, 0);
        }
        const ratio = fullCanvas.width / Math.max(1, dom.viewerContainer.getBoundingClientRect().width);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawPolygonsOnContext(ctx, highlights, {
            fillStyle: "rgba(250, 204, 21, 0.32)",
            strokeStyle: "rgba(217, 119, 6, 1)",
            lineWidth: 2
        });
        return highlightedCanvas;
    }

    async function captureHighlightedContext() {
        if (!highlights.length) {
            throw new Error("no highlight");
        }

        try {
            const svgSnapshot = buildSvgSnapshotContext();
            return {
                mimeType: svgSnapshot.highlightedImage.mimeType,
                dataUrl: svgSnapshot.highlightedImage.dataUrl,
                width: svgSnapshot.highlightedImage.width,
                height: svgSnapshot.highlightedImage.height,
                highlightCount: highlights.length,
                fullImage: svgSnapshot.fullImage,
                highlightedImage: svgSnapshot.highlightedImage
            };
        } catch (svgSnapshotError) {
            console.warn("SVG 快照路徑失敗，改用 raster fallback:", svgSnapshotError);
        }

        try {
            const composed = await captureViewerFromComposedSvg();
            const highlightedDataUrl = safeCanvasToDataUrl(composed.highlightedCanvas);
            const fullDataUrl = safeCanvasToDataUrl(composed.fullCanvas);
            if (highlightedDataUrl && fullDataUrl) {
                return {
                    mimeType: "image/png",
                    dataUrl: highlightedDataUrl,
                    width: composed.highlightedCanvas.width,
                    height: composed.highlightedCanvas.height,
                    highlightCount: highlights.length,
                    fullImage: {
                        mimeType: "image/png",
                        dataUrl: fullDataUrl,
                        width: composed.fullCanvas.width,
                        height: composed.fullCanvas.height
                    },
                    highlightedImage: {
                        mimeType: "image/png",
                        dataUrl: highlightedDataUrl,
                        width: composed.highlightedCanvas.width,
                        height: composed.highlightedCanvas.height
                    }
                };
            }
        } catch (composeError) {
            console.warn("組合式 SVG 快照失敗，改用舊流程:", composeError);
        }

        let fullCanvas = null;
        try {
            fullCanvas = await captureViewerWithoutOverlay();
        } catch (captureError) {
            console.warn("全圖擷取失敗，改用空白底圖保底:", captureError);
            const rect = dom.viewerContainer.getBoundingClientRect();
            const ratio = window.devicePixelRatio || 1;
            fullCanvas = createFallbackBlankCanvas(rect.width * ratio, rect.height * ratio);
        }

        const highlightedCanvas = buildHighlightedCanvas(fullCanvas);
        const highlightedDataUrl = safeCanvasToDataUrl(highlightedCanvas) || safeCanvasToDataUrl(createFallbackBlankCanvas(2, 2));
        const fullDataUrl =
            (!isCanvasTainted(fullCanvas) && safeCanvasToDataUrl(fullCanvas)) ||
            safeCanvasToDataUrl(createFallbackBlankCanvas(fullCanvas.width, fullCanvas.height));

        if (!highlightedDataUrl || !fullDataUrl) {
            throw new Error("snapshot export failed");
        }

        return {
            mimeType: "image/png",
            dataUrl: highlightedDataUrl,
            width: highlightedCanvas.width,
            height: highlightedCanvas.height,
            highlightCount: highlights.length,
            fullImage: {
                mimeType: "image/png",
                dataUrl: fullDataUrl,
                width: fullCanvas.width,
                height: fullCanvas.height
            },
            highlightedImage: {
                mimeType: "image/png",
                dataUrl: highlightedDataUrl,
                width: highlightedCanvas.width,
                height: highlightedCanvas.height
            }
        };
    }

    function setSelectionMode(enabled) {
        isSelectionMode = enabled;
        dom.viewerContainer.dataset.interactionMode = enabled ? "select" : "pan";
        dom.viewerContainer.style.cursor = enabled ? "crosshair" : "";

        if (!enabled) {
            isDrawing = false;
            draftStartPoint = null;
            draftPolygon = null;
            draftFreehandPoints = [];
            polygonDraftPoints = [];
            releaseSelectionPointerCapture();
            clearSelectionBox();
            renderHighlightOverlay();
        }

        setSelectionButtonsState();
    }

    function clearSelectedRegion() {
        highlights = [];
        selectedRegionImage = null;
        clearSelectionBox();
        draftPolygon = null;
        draftFreehandPoints = [];
        polygonDraftPoints = [];
        renderHighlightOverlay();
        renderSelectedRegionPreview();
    }

    function updateSelectionBox(rectPolygon) {
        const bounds = getPolygonBounds(rectPolygon);
        const selectionBox = getOrCreateSelectionBox();
        selectionBox.classList.remove("hidden");
        selectionBox.style.left = `${bounds.minX}px`;
        selectionBox.style.top = `${bounds.minY}px`;
        selectionBox.style.width = `${bounds.width}px`;
        selectionBox.style.height = `${bounds.height}px`;
    }

    function applyActionByPolygon(polygon) {
        if (!isPolygonLargeEnough(polygon, minSelectionSize)) {
            throw new Error("selection too small");
        }

        if (highlightAction === "add") {
            highlights.push({
                id: highlightIdSeed++,
                points: polygon
            });
            return;
        }

        const targetBounds = getPolygonBounds(polygon);
        highlights = highlights.filter((item) => !areBoundsIntersected(getPolygonBounds(item.points), targetBounds));
    }

    async function finalizePolygonAction(polygon) {
        applyActionByPolygon(polygon);
        clearSelectionBox();
        draftPolygon = null;
        renderHighlightOverlay();

        if (!highlights.length) {
            selectedRegionImage = null;
            renderSelectedRegionPreview();
            return;
        }

        selectedRegionImage = await captureHighlightedContext();
        renderSelectedRegionPreview();
        onSelectionCaptured();
        showToast(t("toast.selectionCaptured"));
    }

    function registerEvents() {
        dom.highlightModeSelect.addEventListener("change", () => {
            highlightMode = dom.highlightModeSelect.value;
            draftPolygon = null;
            polygonDraftPoints = [];
            clearSelectionBox();
            renderHighlightOverlay();
        });

        dom.addHighlightBtn.addEventListener("click", () => {
            if (!dom.xmlInput.value.trim()) {
                showToast(t("toast.noDiagramToSelect"), true);
                return;
            }
            highlightAction = "add";
            if (!isSelectionMode) {
                setSelectionMode(true);
            } else {
                setSelectionButtonsState();
            }
        });

        dom.eraseHighlightBtn.addEventListener("click", () => {
            if (!dom.xmlInput.value.trim()) {
                showToast(t("toast.noDiagramToSelect"), true);
                return;
            }
            highlightAction = "erase";
            if (!isSelectionMode) {
                setSelectionMode(true);
            } else {
                setSelectionButtonsState();
            }
        });

        dom.clearSelectedRegionBtn.addEventListener("click", () => {
            clearSelectedRegion();
            setSelectionMode(false);
        });

        dom.viewerContainer.addEventListener("click", async (event) => {
            if (!isSelectionMode || highlightMode !== "polygon") {
                return;
            }

            const rect = dom.viewerContainer.getBoundingClientRect();
            const point = normalizePoint(event.clientX, event.clientY, rect);
            if (polygonDraftPoints.length >= 3 && isPointNear(point, polygonDraftPoints[0])) {
                try {
                    await finalizePolygonAction(polygonDraftPoints.slice());
                    polygonDraftPoints = [];
                    setSelectionMode(false);
                } catch (error) {
                    if (error instanceof Error && error.message === "selection too small") {
                        showToast(t("toast.selectionTooSmall"), true);
                    } else {
                        showToast(t("toast.selectionCaptureFailed"), true);
                    }
                }
                return;
            }

            polygonDraftPoints.push(point);
            draftPolygon = polygonDraftPoints.slice();
            renderHighlightOverlay();
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true });

        dom.viewerContainer.addEventListener("dblclick", async (event) => {
            if (!isSelectionMode || highlightMode !== "polygon" || polygonDraftPoints.length < 3) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            try {
                await finalizePolygonAction(polygonDraftPoints.slice());
                polygonDraftPoints = [];
                setSelectionMode(false);
            } catch (error) {
                if (error instanceof Error && error.message === "selection too small") {
                    showToast(t("toast.selectionTooSmall"), true);
                } else {
                    showToast(t("toast.selectionCaptureFailed"), true);
                }
            }
        }, { capture: true });

        dom.viewerContainer.addEventListener("pointerdown", (event) => {
            if (!isSelectionMode || event.button !== 0 || highlightMode === "polygon") {
                return;
            }
            const rect = dom.viewerContainer.getBoundingClientRect();
            const start = normalizePoint(event.clientX, event.clientY, rect);
            isDrawing = true;
            selectionPointerId = event.pointerId;
            dom.viewerContainer.setPointerCapture(event.pointerId);
            draftStartPoint = start;
            draftFreehandPoints = [start];
            draftPolygon = null;
            clearSelectionBox();
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true });

        window.addEventListener("pointermove", (event) => {
            if (!isSelectionMode || !isDrawing || selectionPointerId === null || event.pointerId !== selectionPointerId) {
                return;
            }
            const rect = dom.viewerContainer.getBoundingClientRect();
            const point = normalizePoint(event.clientX, event.clientY, rect);

            if (highlightMode === "rect" && draftStartPoint) {
                const nextPolygon = polygonFromRect(draftStartPoint, point);
                draftPolygon = nextPolygon;
                updateSelectionBox(nextPolygon);
            } else if (highlightMode === "freehand") {
                draftFreehandPoints.push(point);
                draftPolygon = draftFreehandPoints.slice();
                renderHighlightOverlay();
            }
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true });

        window.addEventListener("pointerup", async (event) => {
            if (!isSelectionMode || !isDrawing || selectionPointerId === null || event.pointerId !== selectionPointerId || event.button !== 0) {
                return;
            }

            isDrawing = false;
            releaseSelectionPointerCapture();

            let finalPolygon = null;
            if (highlightMode === "rect" && draftStartPoint) {
                const rect = dom.viewerContainer.getBoundingClientRect();
                const point = normalizePoint(event.clientX, event.clientY, rect);
                finalPolygon = polygonFromRect(draftStartPoint, point);
            } else if (highlightMode === "freehand") {
                finalPolygon = draftFreehandPoints.slice();
            }

            draftStartPoint = null;
            draftFreehandPoints = [];
            draftPolygon = null;

            if (!finalPolygon || finalPolygon.length < 3) {
                clearSelectionBox();
                renderHighlightOverlay();
                return;
            }

            try {
                await finalizePolygonAction(finalPolygon);
                setSelectionMode(false);
            } catch (error) {
                if (error instanceof Error && error.message === "selection too small") {
                    showToast(t("toast.selectionTooSmall"), true);
                } else {
                    console.error("建立標亮快照失敗:", error);
                    showToast(t("toast.selectionCaptureFailed"), true);
                }
            }
        }, { capture: true });

        window.addEventListener("pointercancel", () => {
            if (!isDrawing) {
                return;
            }
            isDrawing = false;
            draftStartPoint = null;
            draftFreehandPoints = [];
            draftPolygon = null;
            releaseSelectionPointerCapture();
            clearSelectionBox();
            renderHighlightOverlay();
        }, { capture: true });

        window.addEventListener("keydown", async (event) => {
            if (!isSelectionMode) {
                return;
            }
            if (event.key === "Escape") {
                draftPolygon = null;
                polygonDraftPoints = [];
                clearSelectionBox();
                renderHighlightOverlay();
                return;
            }

            if (highlightMode === "polygon" && event.key === "Enter" && polygonDraftPoints.length >= 3) {
                event.preventDefault();
                try {
                    await finalizePolygonAction(polygonDraftPoints.slice());
                    polygonDraftPoints = [];
                    setSelectionMode(false);
                } catch (error) {
                    if (error instanceof Error && error.message === "selection too small") {
                        showToast(t("toast.selectionTooSmall"), true);
                    } else {
                        showToast(t("toast.selectionCaptureFailed"), true);
                    }
                }
            }
        });
    }

    function initialize() {
        dom.highlightModeSelect.value = highlightMode;
        renderHighlightOverlay();
        renderSelectedRegionPreview();
        setSelectionMode(false);
        registerEvents();
    }

    return {
        initialize,
        clearSelectedRegion,
        setSelectionMode,
        getSelectedRegionImage: () => selectedRegionImage,
        refreshTexts: renderSelectedRegionPreview
    };
}
