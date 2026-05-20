const EMPTY_VIEW_HTML =
    '<div class="absolute inset-0 flex items-center justify-center text-slate-400">%EMPTY_MESSAGE%</div>';

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setupMousePanZoom(viewerContainer, diagramHost) {
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

    const onWheel = (event) => {
        event.preventDefault();
        hasInteracted = true;

        const nextScale = clamp(
            scale * (event.deltaY < 0 ? 1.1 : 0.9),
            minScale,
            maxScale
        );

        if (nextScale === scale) {
            return;
        }

        const rect = viewerContainer.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        const worldX = (cursorX - offsetX) / scale;
        const worldY = (cursorY - offsetY) / scale;

        scale = nextScale;
        offsetX = cursorX - worldX * scale;
        offsetY = cursorY - worldY * scale;

        applyTransform();
    };

    const onPointerDown = (event) => {
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
        if (!isDragging || event.pointerId !== dragPointerId) {
            return;
        }

        offsetX = event.clientX - startX;
        offsetY = event.clientY - startY;
        applyTransform();
        event.preventDefault();
    };

    const releaseDragState = (event) => {
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

    if (!centerContent()) {
        applyTransform();
    }

    return () => {
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

export function createDiagramViewer(viewerContainer, onRenderError, translate = (key, fallback = key) => fallback) {
    let teardownInteraction = null;

    function render(xmlString) {
        if (!xmlString || xmlString.trim() === "") {
            if (typeof teardownInteraction === "function") {
                teardownInteraction();
                teardownInteraction = null;
            }

            viewerContainer.innerHTML = EMPTY_VIEW_HTML.replace(
                "%EMPTY_MESSAGE%",
                translate("viewer.empty", "No content to preview")
            );
            return;
        }

        try {
            if (typeof teardownInteraction === "function") {
                teardownInteraction();
                teardownInteraction = null;
            }

            viewerContainer.innerHTML = "";

            const diagramHost = document.createElement("div");
            diagramHost.className = "mxgraph";
            diagramHost.style.width = "100%";
            diagramHost.style.height = "100%";
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
            viewerContainer.appendChild(diagramHost);

            if (
                typeof window.GraphViewer !== "undefined" &&
                typeof window.GraphViewer.processElements === "function"
            ) {
                window.GraphViewer.processElements();
                window.requestAnimationFrame(() => {
                    activatePanTool(diagramHost);
                    teardownInteraction = setupMousePanZoom(viewerContainer, diagramHost);
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
        render
    };
}
