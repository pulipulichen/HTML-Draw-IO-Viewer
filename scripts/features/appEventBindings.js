function triggerXmlDownload(xmlText, fileName) {
    const blob = new Blob([xmlText], { type: "application/xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
}

export function registerInputEvents(options) {
    const {
        dom,
        writeStoredValue,
        storageKeys,
        debounce,
        render,
        toast,
        t,
        loadExampleXml,
        fillXmlAndRender,
        fileNameManager,
        onSampleLoaded = async () => {}
    } = options;

    dom.xmlInput.addEventListener("input", () => {
        writeStoredValue(storageKeys.diagramXml, dom.xmlInput.value);
    });

    window.addEventListener("beforeunload", () => {
        writeStoredValue(storageKeys.diagramXml, dom.xmlInput.value);
    });

    dom.xmlInput.addEventListener(
        "input",
        debounce(() => {
            render(dom.xmlInput.value);
        }, 600)
    );

    dom.formatBtn.addEventListener("click", () => {
        render(dom.xmlInput.value);
        toast.show(t("toast.rerendered"));
    });

    dom.loadSampleBtn.addEventListener("click", () => {
        if (dom.loadingState) {
            dom.loadingState.style.display = "flex";
            const loadingLabel = dom.loadingState.querySelector("[data-i18n='viewer.loading']");
            if (loadingLabel instanceof HTMLElement) {
                loadingLabel.textContent = t("toast.resettingDiagram");
            } else {
                dom.loadingState.textContent = t("toast.resettingDiagram");
            }
        }

        window.setTimeout(async () => {
            try {
                const exampleXml = await loadExampleXml();
                fillXmlAndRender(exampleXml);
                fileNameManager.setSourceFileName("example.drawio");
                await onSampleLoaded(exampleXml);
                toast.show(t("toast.sampleLoaded"));
            } catch (_error) {
                toast.show(t("toast.sampleLoadFailed"), true);
            } finally {
                if (dom.loadingState) {
                    dom.loadingState.style.display = "none";
                }
            }
        }, 150);
    });
}

export function registerTabEvents(options) {
    const { dom, setActiveTab } = options;
    dom.editorTabBtn.addEventListener("click", () => setActiveTab("editor"));
    dom.aiTabBtn.addEventListener("click", () => setActiveTab("ai"));
    dom.versionsTabBtn.addEventListener("click", () => setActiveTab("versions"));
}

export function registerUrlEvents(options) {
    const { dom, toast, t, fetchXmlFromUrl, fillXmlAndRender, fileNameManager, setFetchLoading } = options;
    dom.fetchBtn.addEventListener("click", async () => {
        const url = dom.urlInput.value.trim();
        if (!url) {
            toast.show(t("toast.urlRequired"), true);
            return;
        }

        setFetchLoading(true);
        try {
            const xmlText = await fetchXmlFromUrl(url);
            fillXmlAndRender(xmlText);
            fileNameManager.setSourceFileName(fileNameManager.inferFileNameFromUrl(url));
            toast.show(t("toast.urlLoadSuccess"));
        } catch (_error) {
            toast.show(t("toast.urlLoadFailed"), true);
        } finally {
            setFetchLoading(false);
        }
    });
}

export function registerExportEvents(options) {
    const { dom, toast, t, drawioEditorUrl, fileNameManager } = options;
    dom.downloadXmlBtn.addEventListener("click", () => {
        const xmlText = dom.xmlInput.value.trim();
        if (!xmlText) {
            toast.show(t("toast.noXmlToDownload"), true);
            return;
        }

        triggerXmlDownload(xmlText, fileNameManager.getEffectiveExportFileName());
        toast.show(t("toast.downloadStarted"));
    });

    dom.openInDrawioBtn.addEventListener("click", () => {
        const xmlText = dom.xmlInput.value.trim();
        if (!xmlText) {
            toast.show(t("toast.noXmlToDownload"), true);
            return;
        }

        const exportFileName = fileNameManager.getEffectiveExportFileName();
        try {
            const xmlDataUrl = `data:text/xml;charset=utf-8,${encodeURIComponent(xmlText)}`;
            const drawioUrl =
                `${drawioEditorUrl}&title=${encodeURIComponent(exportFileName)}` +
                `&url=${encodeURIComponent(xmlDataUrl)}`;
            if (drawioUrl.length > 180000) {
                throw new Error("xml too large for drawio url");
            }

            const popup = window.open(drawioUrl, "_blank", "noopener,noreferrer");
            if (!popup) {
                throw new Error("popup blocked");
            }
            toast.show(t("toast.openedCurrentInDrawio"));
        } catch (error) {
            triggerXmlDownload(xmlText, exportFileName);
            window.open(drawioEditorUrl, "_blank", "noopener,noreferrer");
            if (error instanceof Error && error.message === "xml too large for drawio url") {
                toast.show(t("toast.currentXmlTooLargeForDrawioUrl"), true);
                return;
            }
            toast.show(t("toast.failedOpenDrawioWithXml"), true);
        }
    });

    dom.openDrawioLink.addEventListener("click", () => {
        toast.show(t("toast.openedDrawio"));
    });
}

export function registerFileNameEvents(options) {
    const { dom, fileNameManager } = options;

    const applyCurrentFileNameInput = () => {
        fileNameManager.setSourceFileName(dom.currentFileNameInput.value, { preserveAiEditFlag: true });
    };

    dom.currentFileNameInput.addEventListener("change", applyCurrentFileNameInput);
    dom.currentFileNameInput.addEventListener("blur", applyCurrentFileNameInput);
    dom.currentFileNameInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
            return;
        }
        event.preventDefault();
        applyCurrentFileNameInput();
        dom.currentFileNameInput.blur();
    });
}

export function registerFileEvents(options) {
    const {
        dom,
        toast,
        t,
        isSupportedDiagramFile,
        readTextFile,
        fillXmlAndRender,
        fileNameManager
    } = options;

    async function handleFile(file) {
        if (!isSupportedDiagramFile(file.name)) {
            toast.show(t("toast.unsupportedFile"), true);
            return;
        }

        try {
            const text = await readTextFile(file);
            fillXmlAndRender(text);
            fileNameManager.setSourceFileName(file.name);
            toast.show(`${t("toast.fileLoaded")}: ${file.name}`);
        } catch (_error) {
            toast.show(t("toast.fileReadError"), true);
        }
    }

    dom.uploadBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        dom.fileInput.click();
    });

    dom.dropzone.addEventListener("click", () => dom.fileInput.click());

    dom.fileInput.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (file) {
            await handleFile(file);
        }
        event.target.value = "";
    });

    const preventDefaults = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, preventDefaults);
        document.body.addEventListener(eventName, preventDefaults);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, () => {
            dom.dropzone.classList.add("border-blue-500", "bg-blue-50");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dom.dropzone.addEventListener(eventName, () => {
            dom.dropzone.classList.remove("border-blue-500", "bg-blue-50");
        });
    });

    dom.dropzone.addEventListener("drop", async (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            await handleFile(file);
        }
    });
}
