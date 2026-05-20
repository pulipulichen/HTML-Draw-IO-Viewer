function formatTimestamp(timestamp) {
    try {
        return new Date(timestamp).toLocaleString();
    } catch (_error) {
        return timestamp;
    }
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

    function readStoredHistory() {
        const list = readStoredJson(storageKey, []);
        if (!Array.isArray(list)) {
            return [];
        }
        return list.filter((item) => item && item.prompt && item.resultXml && item.timestamp);
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

            const topRow = document.createElement("div");
            topRow.className = "flex items-center justify-between gap-2";

            const meta = document.createElement("span");
            meta.className = "history-meta text-[11px] font-medium";
            meta.textContent = `${t("history.itemLabel")} #${entries.length - index} · ${formatTimestamp(entry.timestamp)}`;

            const restoreButton = document.createElement("button");
            restoreButton.type = "button";
            restoreButton.dataset.restoreIndex = String(index);
            restoreButton.className = "text-xs text-blue-700 hover:text-blue-900 font-semibold";
            restoreButton.textContent = t("history.restoreBtn");

            topRow.appendChild(meta);
            topRow.appendChild(restoreButton);

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

            li.appendChild(topRow);
            li.appendChild(promptLabel);
            li.appendChild(promptText);
            li.appendChild(resultLabel);
            li.appendChild(resultText);
            dom.aiHistoryList.appendChild(li);
        });
    }

    function addEntry({ prompt, resultXml, referenceFiles, usedSelectedRegionImage }) {
        let referencesSummary = "";
        if (referenceFiles.length) {
            referencesSummary = `\n\n[${t("history.referencesSummary")}] ${referenceFiles.map((file) => file.name).join(", ")}`;
        }
        let selectedRegionSummary = "";
        if (usedSelectedRegionImage) {
            selectedRegionSummary = `\n[${t("history.selectedRegionSummary")}] ${usedSelectedRegionImage.width}x${usedSelectedRegionImage.height}px`;
        }

        const entry = {
            timestamp: new Date().toISOString(),
            prompt: `${prompt}${referencesSummary}${selectedRegionSummary}`,
            resultXml
        };

        entries = [entry, ...entries].slice(0, maxItems);
        persist();
        render();
    }

    function clear() {
        entries = [];
        persist();
        render();
    }

    function registerEvents() {
        dom.aiHistoryList.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            const index = Number(target.dataset.restoreIndex);
            if (!Number.isFinite(index)) {
                return;
            }

            const targetEntry = entries[index];
            if (!targetEntry) {
                return;
            }

            onRestore(targetEntry);
            showToast(t("toast.historyRestored"));
        });

        dom.clearHistoryBtn.addEventListener("click", () => {
            clear();
            showToast(t("toast.historyCleared"));
        });
    }

    function initialize() {
        entries = readStoredHistory();
        render();
        registerEvents();
    }

    return {
        initialize,
        addEntry,
        refreshTexts: render
    };
}
