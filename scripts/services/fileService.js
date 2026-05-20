export function isSupportedDiagramFile(fileName) {
    return fileName.endsWith(".xml") || fileName.endsWith(".drawio");
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
