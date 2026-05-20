function waitForNextFrame() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

export function createHistoryThumbnailCapture({ viewerContainer }) {
    return async function captureHistoryThumbnail() {
        const attempts = 3;
        for (let i = 0; i < attempts; i += 1) {
            await waitForNextFrame();
            const containerRect = viewerContainer.getBoundingClientRect();
            if (!containerRect.width || !containerRect.height) {
                continue;
            }
            const svg = viewerContainer.querySelector('[data-viewer-role="diagram-host"] svg');
            if (!(svg instanceof SVGElement)) {
                continue;
            }
            try {
                const clone = svg.cloneNode(true);
                if (!(clone instanceof SVGElement)) {
                    return "";
                }
                if (!clone.getAttribute("xmlns")) {
                    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                }
                if (!clone.getAttribute("xmlns:xlink")) {
                    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
                }
                const svgRect = svg.getBoundingClientRect();
                if (!svgRect.width || !svgRect.height) {
                    continue;
                }
                const sourceWidth = Math.max(1, Math.round(svgRect.width));
                const sourceHeight = Math.max(1, Math.round(svgRect.height));
                if (!clone.getAttribute("viewBox")) {
                    clone.setAttribute(
                        "viewBox",
                        `0 0 ${Math.max(1, sourceWidth)} ${Math.max(1, sourceHeight)}`
                    );
                }
                clone.setAttribute("width", String(Math.max(1, sourceWidth)));
                clone.setAttribute("height", String(Math.max(1, sourceHeight)));

                const serialized = new XMLSerializer().serializeToString(clone);
                const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;

                const image = await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(null);
                    img.src = encoded;
                });
                if (!(image instanceof HTMLImageElement)) {
                    return "";
                }

                const ratio = window.devicePixelRatio || 1;
                const fullCanvas = document.createElement("canvas");
                fullCanvas.width = Math.max(1, Math.round(containerRect.width * ratio));
                fullCanvas.height = Math.max(1, Math.round(containerRect.height * ratio));
                const fullContext = fullCanvas.getContext("2d");
                if (!fullContext) {
                    return "";
                }
                fullContext.fillStyle = "#ffffff";
                fullContext.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
                const drawX = Math.round((svgRect.left - containerRect.left) * ratio);
                const drawY = Math.round((svgRect.top - containerRect.top) * ratio);
                const drawWidth = Math.round(svgRect.width * ratio);
                const drawHeight = Math.round(svgRect.height * ratio);
                fullContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);

                const highlightCanvas = viewerContainer.querySelector("#highlightCanvas");
                if (highlightCanvas instanceof HTMLCanvasElement) {
                    fullContext.drawImage(highlightCanvas, 0, 0, fullCanvas.width, fullCanvas.height);
                }

                const targetMaxWidth = 280;
                const scale = targetMaxWidth / Math.max(1, fullCanvas.width);
                const width = Math.max(1, Math.round(fullCanvas.width * Math.min(1, scale)));
                const height = Math.max(1, Math.round(fullCanvas.height * Math.min(1, scale)));
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d");
                if (!context) {
                    return "";
                }
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, width, height);
                context.drawImage(fullCanvas, 0, 0, width, height);
                return canvas.toDataURL("image/jpeg", 0.7);
            } catch (_error) {
                return "";
            }
        }
        return "";
    };
}
