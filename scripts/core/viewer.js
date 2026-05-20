const EMPTY_VIEW_HTML =
    '<div class="absolute inset-0 flex items-center justify-center text-slate-400">目前沒有內容可以預覽</div>';

export function createDiagramViewer(viewerContainer, onRenderError) {
    function render(xmlString) {
        if (!xmlString || xmlString.trim() === "") {
            viewerContainer.innerHTML = EMPTY_VIEW_HTML;
            return;
        }

        try {
            viewerContainer.innerHTML = "";

            const diagramHost = document.createElement("div");
            diagramHost.className = "mxgraph";
            diagramHost.style.width = "100%";
            diagramHost.style.height = "100%";

            const config = {
                highlight: "#4f46e5",
                nav: true,
                resize: true,
                toolbar: "zoom pan lightbox",
                xml: xmlString
            };

            diagramHost.setAttribute("data-mxgraph", JSON.stringify(config));
            viewerContainer.appendChild(diagramHost);

            if (typeof GraphViewer !== "undefined" && typeof GraphViewer.processElements === "function") {
                GraphViewer.processElements();
                return;
            }

            throw new Error("GraphViewer 尚未載入");
        } catch (error) {
            console.error("渲染錯誤:", error);
            onRenderError("XML 解析失敗，請檢查格式是否正確。");
        }
    }

    return {
        render
    };
}
