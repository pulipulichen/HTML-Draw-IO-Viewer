export function createFileNameManager(options) {
    const { defaultFileName, fileNameInput } = options;
    let sourceFileName = defaultFileName;
    let aiEditedAt = null;

    function sanitizeFileName(fileName) {
        const normalized = String(fileName || "").trim() || defaultFileName;
        return normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    }

    function splitFileName(fileName) {
        const safeFileName = sanitizeFileName(fileName);
        const dotIndex = safeFileName.lastIndexOf(".");
        if (dotIndex <= 0 || dotIndex === safeFileName.length - 1) {
            return { baseName: safeFileName, extension: ".drawio" };
        }
        return {
            baseName: safeFileName.slice(0, dotIndex),
            extension: safeFileName.slice(dotIndex)
        };
    }

    function formatTimestampForFilename(timestampValue) {
        const date = new Date(timestampValue);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `${year}${month}${day}-${hours}${minutes}${seconds}`;
    }

    function updateCurrentFileNameInput() {
        if (document.activeElement === fileNameInput) {
            return;
        }
        fileNameInput.value = sourceFileName;
    }

    function setSourceFileName(nextFileName, config = {}) {
        const { preserveAiEditFlag = false } = config;
        sourceFileName = sanitizeFileName(nextFileName);
        if (!preserveAiEditFlag) {
            aiEditedAt = null;
        }
        updateCurrentFileNameInput();
    }

    function setSourceFormatExtension(sourceFormat, config = {}) {
        const { preserveAiEditFlag = true } = config;
        const parts = splitFileName(sourceFileName);
        const normalizedFormat = sourceFormat === "mermaid" ? "mermaid" : "drawio";
        const nextExtension = normalizedFormat === "mermaid" ? ".mmd" : ".drawio";
        setSourceFileName(`${parts.baseName}${nextExtension}`, { preserveAiEditFlag });
    }

    function markAiEdited(timestampValue = new Date().toISOString()) {
        aiEditedAt = timestampValue;
        updateCurrentFileNameInput();
    }

    function getEffectiveExportFileName() {
        const parts = splitFileName(sourceFileName);
        if (!aiEditedAt) {
            return `${parts.baseName}${parts.extension}`;
        }
        return `${parts.baseName}-${formatTimestampForFilename(aiEditedAt)}${parts.extension}`;
    }

    function inferFileNameFromUrl(urlText) {
        try {
            const url = new URL(urlText);
            const nameFromQuery =
                url.searchParams.get("filename") ||
                url.searchParams.get("file") ||
                url.searchParams.get("name");
            if (nameFromQuery) {
                return sanitizeFileName(nameFromQuery);
            }

            const lastSegment = decodeURIComponent(url.pathname.split("/").pop() || "").trim();
            if (lastSegment) {
                if (/\.(xml|drawio)$/i.test(lastSegment)) {
                    return sanitizeFileName(lastSegment);
                }
                return sanitizeFileName(`${lastSegment}.drawio`);
            }
        } catch (_error) {
            // ignore URL parse failure and fallback to default
        }
        return defaultFileName;
    }

    updateCurrentFileNameInput();

    return {
        getEffectiveExportFileName,
        inferFileNameFromUrl,
        markAiEdited,
        setSourceFormatExtension,
        setSourceFileName,
        updateCurrentFileNameInput
    };
}
