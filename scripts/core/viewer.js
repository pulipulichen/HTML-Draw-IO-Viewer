const EMPTY_VIEW_HTML =
    '<div class="absolute inset-0 flex items-center justify-center text-slate-400">%EMPTY_MESSAGE%</div>';

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
    function render(xmlString) {
        if (!xmlString || xmlString.trim() === "") {
            viewerContainer.innerHTML = EMPTY_VIEW_HTML.replace(
                "%EMPTY_MESSAGE%",
                translate("viewer.empty", "No content to preview")
            );
            return;
        }

        try {
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
                toolbar: "zoom pan lightbox",
                xml: xmlString
            };

            diagramHost.setAttribute("data-mxgraph", JSON.stringify(config));
            viewerContainer.appendChild(diagramHost);

            if (typeof GraphViewer !== "undefined" && typeof GraphViewer.processElements === "function") {
                GraphViewer.processElements();
                window.requestAnimationFrame(() => {
                    activatePanTool(diagramHost);
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
