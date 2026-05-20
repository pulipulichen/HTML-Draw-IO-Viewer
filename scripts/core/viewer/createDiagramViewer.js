import { createMinimap } from "../../ui/minimap.js";
import { resolveRenderFormat } from "./format.js";
import { setupMousePanZoom } from "./panZoom.js";
import {
    clearViewerLayers,
    renderDrawioDiagram,
    renderEmptyState,
    renderMermaidDiagram
} from "./renderEngine.js";

export function createDiagramViewer(viewerContainer, onRenderError, translate = (key, fallback = key) => fallback) {
    let teardownInteraction = null;
    let renderToken = 0;

    const minimap = createMinimap(viewerContainer, translate);

    function teardownPanZoom() {
        if (teardownInteraction && typeof teardownInteraction.teardown === "function") {
            teardownInteraction.teardown();
        }
        teardownInteraction = null;
    }

    function clearViewer() {
        teardownPanZoom();
        minimap.onTransformChange(null, { scale: 1, offsetX: 0, offsetY: 0 });
        clearViewerLayers(viewerContainer);
    }

    function setupPanZoomAndMinimap(diagramHost) {
        const panZoom = setupMousePanZoom(viewerContainer, diagramHost, {
            onTransformChange: (transform) => {
                const svgEl = diagramHost.querySelector("svg");
                minimap.onTransformChange(svgEl, transform);
            }
        });

        teardownInteraction = panZoom;
        minimap.setPanTo(panZoom.panTo);
        minimap.setGetTransform(panZoom.getTransform);
    }

    function render(sourceText, options = {}) {
        const normalizedSource = String(sourceText ?? "");
        const trimmedSource = normalizedSource.trim();
        const formatHint = options.formatHint || "auto";
        const onMermaidRenderFailed =
            typeof options.onMermaidRenderFailed === "function" ? options.onMermaidRenderFailed : null;
        const activeFormat = resolveRenderFormat(trimmedSource, formatHint);

        renderToken += 1;
        const token = renderToken;

        if (!trimmedSource) {
            clearViewer();
            renderEmptyState(viewerContainer, translate);
            return "empty";
        }

        try {
            clearViewer();
            if (activeFormat === "mermaid") {
                renderMermaidDiagram({
                    viewerContainer,
                    diagramSource: trimmedSource,
                    tokenAtSchedule: token,
                    getRenderToken: () => renderToken,
                    setupPanZoomAndMinimap
                }).catch((error) => {
                    if (token !== renderToken) {
                        return;
                    }
                    console.error("Mermaid 渲染錯誤:", error);
                    clearViewer();
                    const handled =
                        onMermaidRenderFailed?.({
                            error,
                            sourceText: trimmedSource,
                            formatHint
                        }) === true;
                    if (!handled) {
                        onRenderError(
                            translate("toast.mermaidParseFailed", "Mermaid parse failed, please check the format")
                        );
                    }
                });
                return "mermaid";
            }

            renderDrawioDiagram({
                viewerContainer,
                diagramSource: trimmedSource,
                tokenAtSchedule: token,
                getRenderToken: () => renderToken,
                setupPanZoomAndMinimap
            });
            return "drawio";
        } catch (error) {
            console.error("渲染錯誤:", error);
            clearViewer();
            onRenderError(translate("toast.xmlParseFailed", "XML parse failed, please check the format"));
            return activeFormat;
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
