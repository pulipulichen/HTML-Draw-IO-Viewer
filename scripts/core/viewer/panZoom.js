function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function setupMousePanZoom(viewerContainer, diagramHost, { onTransformChange } = {}) {
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
    const isNavigationLocked = () => viewerContainer.dataset.navigationLocked === "true";
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
        if (isSelectMode() || isNavigationLocked()) {
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
        if (isSelectMode() || isNavigationLocked()) {
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
        if (isSelectMode() || isNavigationLocked()) {
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
        if (isSelectMode() || isNavigationLocked()) {
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
        if (isNavigationLocked()) {
            return;
        }
        offsetX = newOffsetX;
        offsetY = newOffsetY;
        hasInteracted = true;
        applyTransform();
    };

    const getTransform = () => ({ scale, offsetX, offsetY });
    const zoomBy = (zoomMultiplier) => {
        if (isNavigationLocked()) {
            return;
        }
        const rect = viewerContainer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        zoomAt(centerX, centerY, zoomMultiplier);
    };
    const resetView = () => {
        if (isNavigationLocked()) {
            return;
        }
        fitAndCenterContent();
    };

    return { teardown, panTo, getTransform, zoomBy, resetView };
}
