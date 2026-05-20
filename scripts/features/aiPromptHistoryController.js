function sanitizePrompt(rawPrompt) {
    return String(rawPrompt || "").trim();
}

function normalizePromptList(rawList) {
    if (!Array.isArray(rawList)) {
        return [];
    }
    const normalized = [];
    const seen = new Set();
    rawList.forEach((item) => {
        const prompt = sanitizePrompt(item);
        if (!prompt || seen.has(prompt)) {
            return;
        }
        seen.add(prompt);
        normalized.push(prompt);
    });
    return normalized;
}

export function createAiPromptHistoryController({
    dom,
    t,
    readStoredJson,
    writeStoredValue,
    storageKey,
    showToast,
    onPromptSelected,
    maxItems = 50
}) {
    let prompts = [];

    function persist() {
        writeStoredValue(storageKey, JSON.stringify(prompts));
    }

    function getSearchKeyword() {
        return String(dom.promptHistorySearchInput.value || "").trim().toLowerCase();
    }

    function getFilteredPrompts() {
        const keyword = getSearchKeyword();
        if (!keyword) {
            return prompts.map((prompt, index) => ({ prompt, index }));
        }
        return prompts
            .map((prompt, index) => ({ prompt, index }))
            .filter((item) => item.prompt.toLowerCase().includes(keyword));
    }

    function render() {
        const filteredPrompts = getFilteredPrompts();
        dom.promptHistoryList.innerHTML = "";
        dom.promptHistoryEmpty.classList.toggle("hidden", filteredPrompts.length > 0);
        if (!filteredPrompts.length) {
            const keyword = getSearchKeyword();
            dom.promptHistoryEmpty.textContent = keyword ? t("ai.promptHistoryNoSearchResult") : t("ai.promptHistoryEmpty");
            return;
        }

        filteredPrompts.forEach((item) => {
            const listItem = document.createElement("li");
            listItem.className =
                "flex items-start gap-2 rounded border border-indigo-200 bg-indigo-50/60 px-2 py-1.5";

            const useButton = document.createElement("button");
            useButton.type = "button";
            useButton.className =
                "flex-1 text-left text-xs text-indigo-900 hover:text-indigo-700 leading-4 break-words";
            useButton.dataset.promptHistoryAction = "use";
            useButton.dataset.promptHistoryIndex = String(item.index);
            useButton.textContent = item.prompt;

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className =
                "shrink-0 rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-50";
            deleteButton.dataset.promptHistoryAction = "delete";
            deleteButton.dataset.promptHistoryIndex = String(item.index);
            deleteButton.textContent = t("ai.promptHistoryDeleteBtn");

            listItem.appendChild(useButton);
            listItem.appendChild(deleteButton);
            dom.promptHistoryList.appendChild(listItem);
        });
    }

    function addPrompt(promptText) {
        const prompt = sanitizePrompt(promptText);
        if (!prompt) {
            return;
        }
        prompts = [prompt, ...prompts.filter((item) => item !== prompt)].slice(0, maxItems);
        persist();
        render();
    }

    function removePromptByIndex(index) {
        if (!Number.isInteger(index) || index < 0 || index >= prompts.length) {
            return false;
        }
        prompts.splice(index, 1);
        persist();
        render();
        return true;
    }

    function clearAll() {
        if (!prompts.length) {
            return;
        }
        prompts = [];
        persist();
        render();
    }

    function registerEvents() {
        dom.promptHistorySearchInput.addEventListener("input", () => {
            render();
        });

        dom.promptHistoryList.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            const actionButton = target.closest("button[data-prompt-history-action]");
            if (!(actionButton instanceof HTMLButtonElement)) {
                return;
            }
            const action = actionButton.dataset.promptHistoryAction;
            const index = Number(actionButton.dataset.promptHistoryIndex);
            if (!Number.isInteger(index)) {
                return;
            }
            const selectedPrompt = prompts[index];
            if (!selectedPrompt) {
                return;
            }

            if (action === "use") {
                onPromptSelected(selectedPrompt);
                return;
            }

            if (action === "delete" && removePromptByIndex(index)) {
                showToast(t("toast.promptHistoryItemDeleted"));
            }
        });

        dom.clearPromptHistoryBtn.addEventListener("click", () => {
            if (!prompts.length) {
                return;
            }
            clearAll();
            showToast(t("toast.promptHistoryCleared"));
        });
    }

    function initialize() {
        prompts = normalizePromptList(readStoredJson(storageKey, []));
        persist();
        render();
        registerEvents();
    }

    return {
        initialize,
        addPrompt,
        refreshTexts: render
    };
}
