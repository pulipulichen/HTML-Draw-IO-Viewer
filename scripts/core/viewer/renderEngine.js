const EMPTY_VIEW_HTML =
    '<div class="absolute inset-0 flex items-center justify-center text-slate-400">%EMPTY_MESSAGE%</div>';
const DIAGRAM_HOST_SELECTOR = '[data-viewer-role="diagram-host"]';
const EMPTY_VIEW_SELECTOR = '[data-viewer-role="empty-view"]';
const MERMAID_MODULE_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

let mermaidModulePromise = null;

function loadMermaidModule() {
    if (!mermaidModulePromise) {
        mermaidModulePromise = import(MERMAID_MODULE_URL).then((module) => {
            const mermaidApi = module?.default || module;
            if (!mermaidApi || typeof mermaidApi.render !== "function") {
                throw new Error("Mermaid API unavailable");
            }
            mermaidApi.initialize({
                startOnLoad: false,
                securityLevel: "loose",
                theme: "default"
            });
            return mermaidApi;
        });
    }
    return mermaidModulePromise;
}

function removeRoleElement(viewerContainer, selector) {
    const element = viewerContainer.querySelector(selector);
    if (element instanceof HTMLElement) {
        element.remove();
    }
}

function createDiagramHost() {
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
    return diagramHost;
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

function normalizeMermaidSource(diagramSource) {
    let source = String(diagramSource || "").trim();
    if (!source) {
        return source;
    }

    // Accept common markdown blocks and extract pure Mermaid content.
    source = source
        .replace(/^```mermaid\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .replace(/^:::\s*mermaid\s*/i, "")
        .replace(/\s*:::\s*$/i, "")
        .trim();

    return source;
}

export function clearViewerLayers(viewerContainer) {
    removeRoleElement(viewerContainer, DIAGRAM_HOST_SELECTOR);
    removeRoleElement(viewerContainer, EMPTY_VIEW_SELECTOR);
}

export function renderEmptyState(viewerContainer, translate) {
    clearViewerLayers(viewerContainer);
    const emptyView = document.createElement("div");
    emptyView.setAttribute("data-viewer-role", "empty-view");
    emptyView.innerHTML = EMPTY_VIEW_HTML.replace(
        "%EMPTY_MESSAGE%",
        translate("viewer.empty", "No content to preview")
    );
    viewerContainer.insertBefore(emptyView, viewerContainer.firstChild);
}

export function renderDrawioDiagram({
    viewerContainer,
    diagramSource,
    tokenAtSchedule,
    getRenderToken,
    setupPanZoomAndMinimap
}) {
    const diagramHost = createDiagramHost();
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
        xml: diagramSource
    };

    diagramHost.setAttribute("data-mxgraph", JSON.stringify(config));
    viewerContainer.insertBefore(diagramHost, viewerContainer.firstChild);

    if (
        typeof window.GraphViewer === "undefined" ||
        typeof window.GraphViewer.processElements !== "function"
    ) {
        throw new Error("GraphViewer 尚未載入");
    }

    window.GraphViewer.processElements();
    window.requestAnimationFrame(() => {
        if (tokenAtSchedule !== getRenderToken() || !diagramHost.isConnected) {
            return;
        }
        activatePanTool(diagramHost);
        setupPanZoomAndMinimap(diagramHost);
    });
}

export async function renderMermaidDiagram({
    viewerContainer,
    diagramSource,
    tokenAtSchedule,
    getRenderToken,
    setupPanZoomAndMinimap
}) {
    const mermaid = await loadMermaidModule();
    if (tokenAtSchedule !== getRenderToken()) {
        return;
    }

    const normalizedSource = normalizeMermaidSource(diagramSource);
    if (!normalizedSource || normalizedSource.startsWith("<")) {
        throw new Error("invalid mermaid source");
    }

    if (typeof mermaid.parse === "function") {
        await mermaid.parse(normalizedSource, { suppressErrors: false });
    }

    const diagramHost = createDiagramHost();
    const renderId = `mermaid-diagram-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const renderResult = await mermaid.render(renderId, normalizedSource);
    if (tokenAtSchedule !== getRenderToken()) {
        return;
    }

    const svgWrapper = document.createElement("div");
    svgWrapper.innerHTML = renderResult.svg;
    const renderedSvg = svgWrapper.querySelector("svg");
    if (!(renderedSvg instanceof SVGElement)) {
        throw new Error("Mermaid render result missing SVG");
    }

    const renderedText = renderedSvg.textContent || "";
    if (/Syntax error in text/i.test(renderedText)) {
        throw new Error("mermaid syntax error");
    }

    renderedSvg.style.maxWidth = "100%";
    renderedSvg.style.maxHeight = "100%";
    renderedSvg.style.height = "auto";
    renderedSvg.style.width = "auto";
    diagramHost.appendChild(renderedSvg);
    viewerContainer.insertBefore(diagramHost, viewerContainer.firstChild);

    window.requestAnimationFrame(() => {
        if (tokenAtSchedule !== getRenderToken()) {
            return;
        }
        setupPanZoomAndMinimap(diagramHost);
    });
}
