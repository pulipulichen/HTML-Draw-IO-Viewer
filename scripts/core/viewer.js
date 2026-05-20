import { createMinimap } from "../ui/minimap.js";

const EMPTY_VIEW_HTML =
    '<div class="absolute inset-0 flex items-center justify-center text-slate-400">%EMPTY_MESSAGE%</div>';
const DIAGRAM_HOST_SELECTOR = '[data-viewer-role="diagram-host"]';
const EMPTY_VIEW_SELECTOR = '[data-viewer-role="empty-view"]';

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setupMousePanZoom(viewerContainer, diagramHost, { onTransformChange } = {}) {
    let transformTarget = null;

    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let hasInteracted = false;
    let isDragging = false;
    let dragPointerId = null;
    let startX = 0;
    let startY = 0;

    const minScale = 0.25;
    const maxScale = 4;

    const isSelectMode = () => viewerContainer.dataset.interactionMode === "select";
    const isFromMinimap = (event) =>
        event.target instanceof Element &&
        Boolean(event.target.closest('[data-viewer-role^="minimap-"]'));

    viewerContainer.style.cursor = "grab";
    viewerContainer.style.touchAction = "none";

    const resolveTransformTarget = () => {
        if (transformTarget instanceof HTMLElement && transformTarget.isConnected) {
            return transformTarget;
        }

        const svgElement = diagramHost.querySelector("svg");
        const svgContainer = svgElement?.parentElement;
        const discoveredTarget =
            diagramHost.querySelector(".geDiagramContainer") ||
            diagramHost.querySelector(".mxGraphContainer") ||
            (svgContainer instanceof HTMLElement ? svgContainer : null) ||
            diagramHost.firstElementChild ||
            diagramHost;

        if (!(discoveredTarget instanceof HTMLElement)) {
            return null;
        }

        transformTarget = discoveredTarget;
        transformTarget.style.transformOrigin = "0 0";
        transformTarget.style.willChange = "transform";

        return transformTarget;
    };

    const applyTransform = () => {
        const target = resolveTransformTarget();
        if (!(target instanceof HTMLElement)) {
            return;
        }

        target.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        onTransformChange?.({ scale, offsetX, offsetY });
    };

    const centerContent = () => {
        const target = resolveTransformTarget();
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        const measureTarget = diagramHost.querySelector("svg") || target;
        applyTransform();

        const containerRect = viewerContainer.getBoundingClientRect();
        const contentRect = measureTarget.getBoundingClientRect();

        if (
            !containerRect.width ||
            !containerRect.height ||
            !contentRect.width ||
            !contentRect.height
        ) {
            return false;
        }

        const deltaX =
            containerRect.left + containerRect.width / 2 - (contentRect.left + contentRect.width / 2);
        const deltaY =
            containerRect.top + containerRect.height / 2 - (contentRect.top + contentRect.height / 2);

        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
            return true;
        }

        offsetX += deltaX;
        offsetY += deltaY;
        applyTransform();
        return true;
    };

    const fitAndCenterContent = () => {
        const target = resolveTransformTarget();
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        const measureTarget = diagramHost.querySelector("svg") || target;
        const containerRect = viewerContainer.getBoundingClientRect();
        const contentRect = measureTarget.getBoundingClientRect();
        if (
            !containerRect.width ||
            !containerRect.height ||
            !contentRect.width ||
            !contentRect.height ||
            !scale
        ) {
            return false;
        }

        const naturalWidth = contentRect.width / scale;
        const naturalHeight = contentRect.height / scale;
        if (!naturalWidth || !naturalHeight) {
            return false;
        }

        const fitScale = clamp(
            Math.min(containerRect.width / naturalWidth, containerRect.height / naturalHeight) * 0.95,
            minScale,
            maxScale
        );

        scale = fitScale;
        offsetX = 0;
        offsetY = 0;
        hasInteracted = false;
        applyTransform();
        return centerContent();
    };

    const zoomAt = (cursorX, cursorY, zoomMultiplier) => {
        const nextScale = clamp(scale * zoomMultiplier, minScale, maxScale);
        if (nextScale === scale) {
            return;
        }

        const worldX = (cursorX - offsetX) / scale;
        const worldY = (cursorY - offsetY) / scale;

        scale = nextScale;
        offsetX = cursorX - worldX * scale;
        offsetY = cursorY - worldY * scale;
        hasInteracted = true;
        applyTransform();
    };

    const onWheel = (event) => {
        if (isSelectMode()) {
            return;
        }
        if (isFromMinimap(event)) {
            return;
        }
        event.preventDefault();
        const rect = viewerContainer.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        zoomAt(cursorX, cursorY, event.deltaY < 0 ? 1.1 : 0.9);
    };

    const onPointerDown = (event) => {
        if (isSelectMode()) {
            return;
        }
        if (isFromMinimap(event)) {
            return;
        }
        if (event.button !== 0 && event.button !== 1) {
            return;
        }

        hasInteracted = true;
        isDragging = true;
        dragPointerId = event.pointerId;
        startX = event.clientX - offsetX;
        startY = event.clientY - offsetY;
        viewerContainer.style.cursor = "grabbing";
        viewerContainer.setPointerCapture(event.pointerId);
        event.preventDefault();
    };

    const onPointerMove = (event) => {
        if (isSelectMode()) {
            return;
        }
        if (!isDragging || event.pointerId !== dragPointerId) {
            return;
        }

        offsetX = event.clientX - startX;
        offsetY = event.clientY - startY;
        applyTransform();
        event.preventDefault();
    };

    const releaseDragState = (event) => {
        if (isSelectMode()) {
            return;
        }
        if (!isDragging || event.pointerId !== dragPointerId) {
            return;
        }

        isDragging = false;
        dragPointerId = null;
        viewerContainer.style.cursor = "grab";
        if (viewerContainer.hasPointerCapture(event.pointerId)) {
            viewerContainer.releasePointerCapture(event.pointerId);
        }
    };

    const eventTarget = viewerContainer;
    const observer = new MutationObserver(() => {
        if (!hasInteracted && centerContent()) {
            return;
        }
        applyTransform();
    });

    observer.observe(diagramHost, { childList: true, subtree: true });
    let resizeObserver = null;
    if (typeof window.ResizeObserver === "function") {
        resizeObserver = new window.ResizeObserver(() => {
            if (!hasInteracted && centerContent()) {
                return;
            }
            applyTransform();
        });
    }
    if (resizeObserver) {
        resizeObserver.observe(viewerContainer);
    }

    eventTarget.addEventListener("wheel", onWheel, { passive: false, capture: true });
    eventTarget.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", releaseDragState, { capture: true });
    window.addEventListener("pointercancel", releaseDragState, { capture: true });

    if (!fitAndCenterContent()) {
        if (!centerContent()) {
            applyTransform();
        }
    }

    const teardown = () => {
        observer.disconnect();
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
        eventTarget.removeEventListener("wheel", onWheel, true);
        eventTarget.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("pointermove", onPointerMove, true);
        window.removeEventListener("pointerup", releaseDragState, true);
        window.removeEventListener("pointercancel", releaseDragState, true);
        viewerContainer.style.cursor = "";
        viewerContainer.style.touchAction = "";
    };

    const panTo = (newOffsetX, newOffsetY) => {
        offsetX = newOffsetX;
        offsetY = newOffsetY;
        hasInteracted = true;
        applyTransform();
    };

    const getTransform = () => ({ scale, offsetX, offsetY });
    const zoomBy = (zoomMultiplier) => {
        const rect = viewerContainer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        zoomAt(centerX, centerY, zoomMultiplier);
    };
    const resetView = () => {
        fitAndCenterContent();
    };

    return { teardown, panTo, getTransform, zoomBy, resetView };
}

function activatePanTool(diagramHost) {
    const panToggleButton =
        diagramHost.querySelector('[title="Pan"]') ||
        diagramHost.querySelector('[title="平移"]') ||
        diagramHost.querySelector('[data-action="pan"]');

    if (panToggleButton instanceof HTMLElement) {
        panToggleButton.click();
    }
}

function removeRoleElement(viewerContainer, selector) {
    const element = viewerContainer.querySelector(selector);
    if (element instanceof HTMLElement) {
        element.remove();
    }
}

export function createDiagramViewer(viewerContainer, onRenderError, translate = (key, fallback = key) => fallback) {
    let teardownInteraction = null;

    const minimap = createMinimap(viewerContainer, translate);

    function teardownPanZoom() {
        if (teardownInteraction && typeof teardownInteraction.teardown === "function") {
            teardownInteraction.teardown();
        }
        teardownInteraction = null;
    }

    function render(xmlString) {
        if (!xmlString || xmlString.trim() === "") {
            teardownPanZoom();
            minimap.onTransformChange(null, { scale: 1, offsetX: 0, offsetY: 0 });

            removeRoleElement(viewerContainer, DIAGRAM_HOST_SELECTOR);
            removeRoleElement(viewerContainer, EMPTY_VIEW_SELECTOR);

            const emptyView = document.createElement("div");
            emptyView.setAttribute("data-viewer-role", "empty-view");
            emptyView.innerHTML = EMPTY_VIEW_HTML.replace(
                "%EMPTY_MESSAGE%",
                translate("viewer.empty", "No content to preview")
            );
            viewerContainer.insertBefore(emptyView, viewerContainer.firstChild);
            return;
        }

        try {
            teardownPanZoom();

            removeRoleElement(viewerContainer, DIAGRAM_HOST_SELECTOR);
            removeRoleElement(viewerContainer, EMPTY_VIEW_SELECTOR);

            const diagramHost = document.createElement("div");
            diagramHost.className = "mxgraph";
            diagramHost.setAttribute("data-viewer-role", "diagram-host");
            diagramHost.style.width = "100%";
            diagramHost.style.height = "100%";
            diagramHost.style.position = "absolute";
            diagramHost.style.inset = "0";
            diagramHost.style.display = "flex";
            diagramHost.style.alignItems = "center";
            diagramHost.style.justifyContent = "center";

            const config = {
                highlight: "#4f46e5",
                nav: true,
                resize: true,
                fit: true,
                center: true,
                zoomWheel: true,
                pan: true,
                lightbox: false,
                toolbar: "zoom pan",
                xml: xmlString
            };

            diagramHost.setAttribute("data-mxgraph", JSON.stringify(config));
            viewerContainer.insertBefore(diagramHost, viewerContainer.firstChild);

            if (
                typeof window.GraphViewer !== "undefined" &&
                typeof window.GraphViewer.processElements === "function"
            ) {
                window.GraphViewer.processElements();
                window.requestAnimationFrame(() => {
                    activatePanTool(diagramHost);

                    const panZoom = setupMousePanZoom(viewerContainer, diagramHost, {
                        onTransformChange: (transform) => {
                            const svgEl = diagramHost.querySelector("svg");
                            minimap.onTransformChange(svgEl, transform);
                        }
                    });

                    teardownInteraction = panZoom;
                    minimap.setPanTo(panZoom.panTo);
                    minimap.setGetTransform(panZoom.getTransform);
                });
                return;
            }

            throw new Error("GraphViewer 尚未載入");
        } catch (error) {
            console.error("渲染錯誤:", error);
            onRenderError(translate("toast.xmlParseFailed", "XML parse failed, please check the format"));
        }
    }

    return {
        render,
        minimap,
        zoomIn() {
            if (teardownInteraction && typeof teardownInteraction.zoomBy === "function") {
                teardownInteraction.zoomBy(1.1);
            }
        },
        zoomOut() {
            if (teardownInteraction && typeof teardownInteraction.zoomBy === "function") {
                teardownInteraction.zoomBy(0.9);
            }
        },
        resetView() {
            if (teardownInteraction && typeof teardownInteraction.resetView === "function") {
                teardownInteraction.resetView();
            }
        }
    };
}
