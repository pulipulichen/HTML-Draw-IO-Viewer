function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}\n...[truncated]`;
}

export function createReferenceFilesController({
    dom,
    t,
    readTextFile,
    showToast,
    maxReferenceTextLength = 15000
}) {
    let files = [];

    function sanitizeReferenceContent(content) {
        const trimmed = String(content || "").trim();
        if (!trimmed) {
            return "";
        }
        return truncateText(trimmed, maxReferenceTextLength);
    }

    function render() {
        dom.referenceFilesList.innerHTML = "";

        if (!files.length) {
            const emptyItem = document.createElement("li");
            emptyItem.className = "text-xs text-indigo-700/70";
            emptyItem.textContent = t("ai.noReferences");
            dom.referenceFilesList.appendChild(emptyItem);
            return;
        }

        files.forEach((file, index) => {
            const item = document.createElement("li");
            item.className = "flex items-center justify-between gap-2 bg-white border border-indigo-100 rounded px-2 py-1.5";

            const label = document.createElement("span");
            label.className = "truncate text-indigo-900";
            label.textContent = `${file.name} (${Math.round(file.content.length / 1024) || 1} KB)`;

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "text-[11px] text-indigo-700 hover:text-indigo-900 font-medium";
            removeButton.dataset.index = String(index);
            removeButton.textContent = t("ai.removeReferenceBtn");

            item.appendChild(label);
            item.appendChild(removeButton);
            dom.referenceFilesList.appendChild(item);
        });
    }

    async function append(fileList) {
        const nextFiles = Array.from(fileList || []);
        if (!nextFiles.length) {
            return;
        }

        const parsed = await Promise.all(
            nextFiles.map(async (file) => {
                const text = await readTextFile(file);
                const content = sanitizeReferenceContent(text);
                return {
                    key: `${file.name}-${file.size}-${file.lastModified}`,
                    name: file.name,
                    content
                };
            })
        );

        const existingKeys = new Set(files.map((item) => item.key));
        parsed.forEach((item) => {
            if (item.content && !existingKeys.has(item.key)) {
                files.push(item);
            }
        });
        render();
    }

    function clear() {
        files = [];
        render();
    }

    function getFiles() {
        return files.slice();
    }

    function registerEvents() {
        dom.referenceUploadBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            dom.referenceFileInput.click();
        });

        dom.referenceDropzone.addEventListener("click", () => dom.referenceFileInput.click());

        dom.referenceFileInput.addEventListener("change", async (event) => {
            try {
                await append(event.target.files || []);
            } catch (_error) {
                showToast(t("toast.referenceReadFailed"), true);
            } finally {
                event.target.value = "";
            }
        });

        const preventDefaults = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
            dom.referenceDropzone.addEventListener(eventName, preventDefaults);
        });

        ["dragenter", "dragover"].forEach((eventName) => {
            dom.referenceDropzone.addEventListener(eventName, () => {
                dom.referenceDropzone.classList.add("bg-indigo-100/60");
            });
        });

        ["dragleave", "drop"].forEach((eventName) => {
            dom.referenceDropzone.addEventListener(eventName, () => {
                dom.referenceDropzone.classList.remove("bg-indigo-100/60");
            });
        });

        dom.referenceDropzone.addEventListener("drop", async (event) => {
            const droppedFiles = event.dataTransfer?.files || [];
            try {
                await append(droppedFiles);
            } catch (_error) {
                showToast(t("toast.referenceReadFailed"), true);
            }
        });

        dom.referenceFilesList.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            const index = Number(target.dataset.index);
            if (!Number.isFinite(index)) {
                return;
            }

            files.splice(index, 1);
            render();
        });

        dom.clearReferenceFilesBtn.addEventListener("click", () => {
            clear();
        });
    }

    function initialize() {
        render();
        registerEvents();
    }

    return {
        initialize,
        getFiles,
        clear,
        refreshTexts: render
    };
}
