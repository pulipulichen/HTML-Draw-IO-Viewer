const MINIMAP_MAX_DIM = 160;
const MINIMAP_MIN_DIM = 60;

function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
}

function buildToggleIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2"/>
        <rect x="5" y="5" width="6" height="6" rx="1"/>
        <rect x="15" y="5" width="4" height="4" rx="1"/>
        <rect x="5" y="15" width="4" height="4" rx="1"/>
        <rect x="14" y="14" width="6" height="6" rx="1"/>
    </svg>`;
}

export function createMinimap(viewerContainer, translate = (k, fb = k) => fb) {
    let svgEl = null;
    let svgMutationObserver = null;
    let cloneRefreshQueued = false;
    let minimapW = 0;
    let minimapH = 0;
    let svgNatW = 0;
    let svgNatH = 0;
    let isVisible = true;
    let isDragging = false;

    let getTransformFn = () => ({ scale: 1, offsetX: 0, offsetY: 0 });
    let panToFn = null;

    // ── Outer wrapper (positioned inside viewerContainer) ───────────────────
    const wrap = document.createElement("div");
    wrap.setAttribute("data-viewer-role", "minimap-wrap");
    Object.assign(wrap.style, {
        position: "absolute",
        bottom: "12px",
        right: "12px",
        zIndex: "15",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "4px",
        pointerEvents: "none"
    });
    viewerContainer.appendChild(wrap);

    // ── Minimap panel ────────────────────────────────────────────────────────
    const panel = document.createElement("div");
    panel.setAttribute("data-viewer-role", "minimap-panel");
    Object.assign(panel.style, {
        pointerEvents: "auto",
        background: "rgba(255,255,255,0.93)",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.13)",
        overflow: "hidden",
        cursor: "crosshair",
        userSelect: "none",
        touchAction: "none",
        position: "relative",
        flexShrink: "0"
    });
    panel.setAttribute("role", "img");
    panel.setAttribute("aria-label", translate("viewer.minimapAriaLabel", "Diagram minimap"));

    // SVG host (holds the scaled-down clone)
    const svgHost = document.createElement("div");
    Object.assign(svgHost.style, {
        position: "relative",
        overflow: "hidden",
        display: "block"
    });
    const previewImage = document.createElement("img");
    previewImage.alt = "";
    Object.assign(previewImage.style, {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        pointerEvents: "none",
        userSelect: "none"
    });
    svgHost.appendChild(previewImage);
    panel.appendChild(svgHost);

    // Viewport indicator rectangle
    const vpRect = document.createElement("div");
    Object.assign(vpRect.style, {
        position: "absolute",
        top: "0",
        left: "0",
        border: "2px solid #4f46e5",
        background: "rgba(79,70,229,0.12)",
        boxSizing: "border-box",
        pointerEvents: "none",
        borderRadius: "2px",
        transition: "none"
    });
    panel.appendChild(vpRect);
    wrap.appendChild(panel);

    // ── Toggle button ────────────────────────────────────────────────────────
    const toggleBtn = document.createElement("button");
    toggleBtn.setAttribute("data-viewer-role", "minimap-toggle");
    toggleBtn.type = "button";
    Object.assign(toggleBtn.style, {
        pointerEvents: "auto",
        background: "rgba(255,255,255,0.9)",
        border: "1px solid #e2e8f0",
        borderRadius: "6px",
        padding: "4px 6px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        color: "#64748b",
        fontWeight: "500",
        lineHeight: "1"
    });
    toggleBtn.innerHTML = buildToggleIcon();
    wrap.appendChild(toggleBtn);

    function applyVisibility() {
        panel.style.display = isVisible ? "block" : "none";
        toggleBtn.style.opacity = isVisible ? "1" : "0.55";
        toggleBtn.title = isVisible ? translate("viewer.minimapHide", "Hide minimap") : translate("viewer.minimapShow", "Show minimap");
    }
    applyVisibility();

    toggleBtn.addEventListener("click", () => {
        isVisible = !isVisible;
        applyVisibility();
    });

    // ── SVG clone helpers ────────────────────────────────────────────────────
    function refreshSvgClone() {
        if (!svgEl || !minimapW || !minimapH) {
            previewImage.removeAttribute("src");
            return;
        }

        const clone = svgEl.cloneNode(true);
        if (!(clone instanceof SVGElement)) {
            previewImage.removeAttribute("src");
            return;
        }
        clone.removeAttribute("style");
        clone.setAttribute("width", String(Math.max(1, Math.round(svgNatW))));
        clone.setAttribute("height", String(Math.max(1, Math.round(svgNatH))));
        if (!clone.getAttribute("viewBox")) {
            clone.setAttribute("viewBox", `0 0 ${Math.max(1, svgNatW)} ${Math.max(1, svgNatH)}`);
        }
        if (!clone.getAttribute("xmlns")) {
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        if (!clone.getAttribute("xmlns:xlink")) {
            clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
        }

        const svgText = new XMLSerializer().serializeToString(clone);
        previewImage.src = `data:image/svg+xml;base64,${utf8ToBase64(svgText)}`;

        svgHost.style.width = minimapW + "px";
        svgHost.style.height = minimapH + "px";
    }

    function disconnectSvgObserver() {
        if (svgMutationObserver) {
            svgMutationObserver.disconnect();
            svgMutationObserver = null;
        }
    }

    function queueCloneRefresh() {
        if (cloneRefreshQueued) {
            return;
        }
        cloneRefreshQueued = true;
        window.requestAnimationFrame(() => {
            cloneRefreshQueued = false;
            if (!svgEl) {
                return;
            }
            const { scale } = getTransformFn();
            if (computeMinimapDimensions(scale)) {
                refreshSvgClone();
            }
            updateViewport();
        });
    }

    function observeSvgMutations(targetSvg) {
        disconnectSvgObserver();
        if (!(targetSvg instanceof SVGElement) || typeof window.MutationObserver !== "function") {
            return;
        }
        svgMutationObserver = new window.MutationObserver(() => {
            queueCloneRefresh();
        });
        svgMutationObserver.observe(targetSvg, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });
    }

    function computeMinimapDimensions(scale) {
        if (!svgEl) return false;

        const bcr = svgEl.getBoundingClientRect();
        const bcrW = bcr.width;
        const bcrH = bcr.height;

        if (bcrW > 0 && bcrH > 0) {
            svgNatW = bcrW / scale;
            svgNatH = bcrH / scale;
        } else {
            // Fallback to SVG attributes
            const vb = svgEl.viewBox?.baseVal;
            svgNatW =
                (vb && vb.width > 0 ? vb.width : parseFloat(svgEl.getAttribute("width") || "0")) ||
                800;
            svgNatH =
                (vb && vb.height > 0 ? vb.height : parseFloat(svgEl.getAttribute("height") || "0")) ||
                600;
        }

        if (!svgNatW || !svgNatH) return false;

        const ratio = Math.min(
            MINIMAP_MAX_DIM / svgNatW,
            MINIMAP_MAX_DIM / svgNatH
        );
        minimapW = Math.round(Math.max(MINIMAP_MIN_DIM, svgNatW * ratio));
        minimapH = Math.round(Math.max(MINIMAP_MIN_DIM, svgNatH * ratio));

        panel.style.width = minimapW + "px";
        panel.style.height = minimapH + "px";
        return true;
    }

    // ── Viewport rect update ─────────────────────────────────────────────────
    function updateViewport() {
        if (!svgEl || !minimapW || !svgNatW) {
            vpRect.style.width = "0";
            vpRect.style.height = "0";
            return;
        }

        const vcBCR = viewerContainer.getBoundingClientRect();
        const svgBCR = svgEl.getBoundingClientRect();
        const { scale } = getTransformFn();

        const ratio = minimapW / svgNatW;
        const svgScreenLeft = svgBCR.left - vcBCR.left;
        const svgScreenTop = svgBCR.top - vcBCR.top;

        // Visible region in SVG world coords
        const visLeft = -svgScreenLeft / scale;
        const visTop = -svgScreenTop / scale;
        const visW = vcBCR.width / scale;
        const visH = vcBCR.height / scale;

        vpRect.style.left = visLeft * ratio + "px";
        vpRect.style.top = visTop * ratio + "px";
        vpRect.style.width = Math.max(4, visW * ratio) + "px";
        vpRect.style.height = Math.max(4, visH * ratio) + "px";
    }

    // ── Navigation on minimap click/drag ─────────────────────────────────────
    function navigateTo(mx, my) {
        if (!panToFn || !minimapW || !svgNatW || !svgEl) return;

        const vcBCR = viewerContainer.getBoundingClientRect();
        const svgBCR = svgEl.getBoundingClientRect();
        const { scale, offsetX, offsetY } = getTransformFn();

        const ratio = minimapW / svgNatW;
        const wx = mx / ratio;
        const wy = my / ratio;

        // Center viewerContainer viewport on (wx, wy) in world space
        const cx = vcBCR.width / 2;
        const cy = vcBCR.height / 2;

        // naturalPos = svgScreenPos - offset (layout position before CSS transform)
        const svgScreenLeft = svgBCR.left - vcBCR.left;
        const svgScreenTop = svgBCR.top - vcBCR.top;

        const newOffsetX = cx - wx * scale - (svgScreenLeft - offsetX);
        const newOffsetY = cy - wy * scale - (svgScreenTop - offsetY);

        panToFn(newOffsetX, newOffsetY);
    }

    panel.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        panel.setPointerCapture(e.pointerId);
        const rect = panel.getBoundingClientRect();
        navigateTo(e.clientX - rect.left, e.clientY - rect.top);
        e.stopPropagation();
        e.preventDefault();
    }, { capture: true });

    panel.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        const rect = panel.getBoundingClientRect();
        navigateTo(e.clientX - rect.left, e.clientY - rect.top);
        e.stopPropagation();
        e.preventDefault();
    }, { capture: true });

    ["pointerup", "pointercancel"].forEach((evName) => {
        panel.addEventListener(evName, (e) => {
            if (panel.hasPointerCapture(e.pointerId)) {
                panel.releasePointerCapture(e.pointerId);
            }
            isDragging = false;
            e.stopPropagation();
        }, { capture: true });
    });

    // ── Public API ───────────────────────────────────────────────────────────
    return {
        /**
         * Called by viewer on every applyTransform(). Passes the current SVG
         * element and transform state. Triggers an SVG clone refresh when the
         * SVG element reference changes.
         */
        onTransformChange(nextSvgEl, transform) {
            if (!nextSvgEl) {
                svgEl = null;
                disconnectSvgObserver();
                previewImage.removeAttribute("src");
                panel.style.display = "none";
                return;
            }

            panel.style.display = isVisible ? "block" : "none";

            if (nextSvgEl !== svgEl) {
                svgEl = nextSvgEl;
                observeSvgMutations(svgEl);
                if (computeMinimapDimensions(transform.scale)) {
                    refreshSvgClone();
                }
            }

            updateViewport();
        },

        /** Provide the panTo(offsetX, offsetY) function from setupMousePanZoom. */
        setPanTo(fn) {
            panToFn = fn;
        },

        /** Provide the getTransform() getter from setupMousePanZoom. */
        setGetTransform(fn) {
            getTransformFn = fn;
        },

        /** Update i18n text on language change. */
        refreshTexts() {
            panel.setAttribute("aria-label", translate("viewer.minimapAriaLabel", "Diagram minimap"));
            applyVisibility();
        },

        destroy() {
            disconnectSvgObserver();
            wrap.remove();
        }
    };
}
