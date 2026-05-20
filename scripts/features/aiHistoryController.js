function formatTimestamp(timestamp) {
    try {
        return new Date(timestamp).toLocaleString();
    } catch (_error) {
        return timestamp;
    }
}

function sanitizeFileName(fileName, fallback = "diagram.drawio") {
    const normalized = String(fileName || "").trim() || fallback;
    return normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function sanitizeHistoryEntry(rawEntry) {
    if (!rawEntry || !rawEntry.prompt || !rawEntry.resultXml || !rawEntry.timestamp) {
        return null;
    }
    const hasValidThumbnail =
        typeof rawEntry.thumbnailDataUrl === "string" &&
        rawEntry.thumbnailDataUrl.startsWith("data:image/");
    const safeThumbnail = hasValidThumbnail ? rawEntry.thumbnailDataUrl : "";
    return {
        timestamp: rawEntry.timestamp,
        prompt: String(rawEntry.prompt),
        resultXml: String(rawEntry.resultXml),
        fileName: sanitizeFileName(rawEntry.fileName),
        thumbnailDataUrl: safeThumbnail
    };
}

function triggerXmlDownload(xmlText, fileName) {
    const blob = new Blob([xmlText], { type: "application/xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = sanitizeFileName(fileName);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
}

function fallbackCopyTextToClipboard(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
}

export function createAiHistoryController({
    dom,
    t,
    readStoredJson,
    writeStoredValue,
    storageKey,
    showToast,
    onRestore,
    maxItems = 20
}) {
    let entries = [];
    let activeVersionIndex = -1;

    function readStoredHistory() {
        const list = readStoredJson(storageKey, []);
        if (!Array.isArray(list)) {
            return [];
        }
        return list
            .map((item) => sanitizeHistoryEntry(item))
            .filter((item) => Boolean(item));
    }

    function persist() {
        writeStoredValue(storageKey, JSON.stringify(entries));
    }

    function render() {
        dom.aiHistoryList.innerHTML = "";
        dom.aiHistoryEmpty.classList.toggle("hidden", entries.length > 0);

        entries.forEach((entry, index) => {
            const li = document.createElement("li");
            li.className = "border border-slate-200 rounded-md p-2 bg-slate-50";
            if (index === activeVersionIndex) {
                li.classList.add("ring-2", "ring-blue-300", "bg-blue-50");
            }

            const layoutRow = document.createElement("div");
            layoutRow.className = "flex items-start gap-3";

            const thumbnailBox = document.createElement("div");
            thumbnailBox.className = "w-24 h-24 shrink-0 rounded border border-slate-200 bg-white overflow-hidden";

            if (entry.thumbnailDataUrl) {
                const thumbImage = document.createElement("img");
                thumbImage.src = entry.thumbnailDataUrl;
                thumbImage.alt = t("history.thumbnailAlt");
                thumbImage.className = "w-full h-full object-cover";
                thumbnailBox.appendChild(thumbImage);
            } else {
                const thumbEmpty = document.createElement("div");
                thumbEmpty.className = "w-full h-full flex items-center justify-center text-[10px] text-slate-400";
                thumbEmpty.textContent = t("history.thumbnailLabel");
                thumbnailBox.appendChild(thumbEmpty);
            }

            const contentWrap = document.createElement("div");
            contentWrap.className = "min-w-0 flex-1";

            const topRow = document.createElement("div");
            topRow.className = "flex items-center";

            const meta = document.createElement("span");
            meta.className = "history-meta text-[11px] font-medium whitespace-nowrap";
            meta.textContent = `${t("history.itemLabel")} #${entries.length - index} · ${formatTimestamp(entry.timestamp)}`;
            meta.title = meta.textContent;

            const restoreButton = document.createElement("button");
            restoreButton.type = "button";
            restoreButton.dataset.historyAction = "restore";
            restoreButton.dataset.historyIndex = String(index);
            restoreButton.className =
                "px-2 py-1 text-[11px] font-semibold rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300";
            restoreButton.textContent = t("history.restoreBtn");

            const actions = document.createElement("div");
            actions.className = "flex items-center gap-1.5 shrink-0";

            const copyButton = document.createElement("button");
            copyButton.type = "button";
            copyButton.dataset.historyAction = "copy";
            copyButton.dataset.historyIndex = String(index);
            copyButton.className =
                "px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100";
            copyButton.textContent = t("history.copyBtn");

            const downloadButton = document.createElement("button");
            downloadButton.type = "button";
            downloadButton.dataset.historyAction = "download";
            downloadButton.dataset.historyIndex = String(index);
            downloadButton.className =
                "px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100";
            downloadButton.textContent = t("history.downloadBtn");

            actions.appendChild(restoreButton);
            actions.appendChild(copyButton);
            actions.appendChild(downloadButton);

            topRow.appendChild(meta);

            const actionRow = document.createElement("div");
            actionRow.className = "mt-1 flex items-center gap-1.5";
            actionRow.appendChild(actions);

            const promptLabel = document.createElement("div");
            promptLabel.className = "mt-1 text-[11px] font-semibold text-slate-600";
            promptLabel.textContent = t("history.promptLabel");

            const promptText = document.createElement("pre");
            promptText.className = "history-prompt text-[11px] leading-4 whitespace-pre-wrap break-words bg-white border border-slate-200 rounded p-2 max-h-20 overflow-y-auto";
            promptText.textContent = entry.prompt;

            const resultLabel = document.createElement("div");
            resultLabel.className = "mt-2 text-[11px] font-semibold text-slate-600";
            resultLabel.textContent = t("history.resultLabel");

            const resultText = document.createElement("pre");
            resultText.className = "text-[11px] leading-4 whitespace-pre-wrap break-words bg-white border border-slate-200 rounded p-2 max-h-28 overflow-y-auto";
            resultText.textContent = entry.resultXml;

            contentWrap.appendChild(topRow);
            contentWrap.appendChild(actionRow);
            contentWrap.appendChild(promptLabel);
            contentWrap.appendChild(promptText);
            contentWrap.appendChild(resultLabel);
            contentWrap.appendChild(resultText);
            layoutRow.appendChild(thumbnailBox);
            layoutRow.appendChild(contentWrap);
            li.appendChild(layoutRow);
            dom.aiHistoryList.appendChild(li);
        });
    }

    function addEntry({
        prompt,
        resultXml,
        referenceFiles,
        usedSelectedRegionImage,
        fileName,
        thumbnailDataUrl = ""
    }) {
        let referencesSummary = "";
        if (referenceFiles.length) {
            referencesSummary = `\n\n[${t("history.referencesSummary")}] ${referenceFiles.map((file) => file.name).join(", ")}`;
        }
        let selectedRegionSummary = "";
        if (usedSelectedRegionImage) {
            selectedRegionSummary = `\n[${t("history.selectedRegionSummary")}] ${usedSelectedRegionImage.width}x${usedSelectedRegionImage.height}px`;
        }

        const hasValidThumbnail =
            typeof thumbnailDataUrl === "string" && thumbnailDataUrl.startsWith("data:image/");

        const entry = {
            timestamp: new Date().toISOString(),
            prompt: `${prompt}${referencesSummary}${selectedRegionSummary}`,
            resultXml,
            fileName: sanitizeFileName(fileName),
            thumbnailDataUrl: hasValidThumbnail ? thumbnailDataUrl : ""
        };

        entries = [entry, ...entries].slice(0, maxItems);
        activeVersionIndex = 0;
        persist();
        render();
    }

    function clear() {
        entries = [];
        activeVersionIndex = -1;
        persist();
        render();
    }

    function registerEvents() {
        dom.aiHistoryList.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            const actionButton = target.closest("button[data-history-action]");
            if (!(actionButton instanceof HTMLButtonElement)) {
                return;
            }

            const action = actionButton.dataset.historyAction;
            const index = Number(actionButton.dataset.historyIndex);
            if (!Number.isFinite(index)) {
                return;
            }

            const targetEntry = entries[index];
            if (!targetEntry) {
                return;
            }

            if (action === "restore") {
                activeVersionIndex = index;
                render();
                onRestore(targetEntry);
                showToast(t("toast.historyRestored"));
                return;
            }

            if (action === "copy") {
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(targetEntry.resultXml);
                    } else {
                        fallbackCopyTextToClipboard(targetEntry.resultXml);
                    }
                    showToast(t("toast.historyCopied"));
                } catch (_error) {
                    showToast(t("toast.historyCopyFailed"), true);
                }
                return;
            }

            if (action === "download") {
                triggerXmlDownload(targetEntry.resultXml, targetEntry.fileName);
                showToast(t("toast.downloadStarted"));
            }
        });

        dom.clearHistoryBtn.addEventListener("click", () => {
            clear();
            showToast(t("toast.historyCleared"));
        });
    }

    function initialize() {
        entries = readStoredHistory();
        activeVersionIndex = entries.length ? 0 : -1;
        render();
        registerEvents();
    }

    function restoreByIndex(index, options = {}) {
        const { showRestoredToast = false } = options;
        if (!entries.length) {
            return false;
        }
        const resolvedIndex = Math.max(0, Math.min(index, entries.length - 1));
        const targetEntry = entries[resolvedIndex];
        if (!targetEntry) {
            return false;
        }
        activeVersionIndex = resolvedIndex;
        render();
        onRestore(targetEntry);
        if (showRestoredToast) {
            showToast(t("toast.historyRestored"));
        }
        return true;
    }

    function restoreRelative(step) {
        if (!entries.length) {
            return false;
        }
        if (!Number.isFinite(activeVersionIndex) || activeVersionIndex < 0) {
            activeVersionIndex = 0;
        }
        return restoreByIndex(activeVersionIndex + step);
    }

    return {
        initialize,
        addEntry,
        refreshTexts: render,
        restoreRelative
    };
}
