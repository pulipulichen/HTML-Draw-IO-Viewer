export function isSupportedDiagramFile(fileName) {
    const normalizedName = String(fileName || "").toLowerCase();
    return (
        normalizedName.endsWith(".xml") ||
        normalizedName.endsWith(".drawio") ||
        normalizedName.endsWith(".mmd") ||
        normalizedName.endsWith(".mermaid")
    );
}

export function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            resolve(String(event.target?.result ?? ""));
        };

        reader.onerror = () => {
            reject(new Error("讀取錯誤"));
        };

        reader.readAsText(file);
    });
}
