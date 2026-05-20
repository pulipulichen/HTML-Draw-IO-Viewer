import { ENV_API_KEY } from "./constants.js";
import { createDiagramViewer } from "./core/viewer.js";
import { requestAiXml } from "./services/aiService.js";
import { isSupportedDiagramFile, readTextFile } from "./services/fileService.js";
import { fetchXmlFromUrl } from "./services/networkService.js";
import { createToastController } from "./ui/toast.js";
import { debounce } from "./utils/debounce.js";
import { getDomElements } from "./utils/dom.js";

const dom = getDomElements();
const toast = createToastController(dom.toast);
const viewer = createDiagramViewer(dom.viewerContainer, (message) => toast.show(message, true));
const STORAGE_KEYS = {
    apiKey: "drawio-viewer-gemini-api-key",
    model: "drawio-viewer-gemini-model",
    diagramXml: "drawio-viewer-diagram-xml"
};
const DEFAULT_MODEL_NAME = "gemini-flash-latest";
const EXAMPLE_DRAWIO_PATH = "./example.drawio";

function render(xml) {
    viewer.render(xml);
}

function setFetchLoading(isLoading) {
    dom.fetchBtn.disabled = isLoading;
    dom.fetchBtn.textContent = isLoading ? "載入中" : "載入";
}

function setAiLoading(isLoading) {
    dom.askAiBtn.disabled = isLoading;
    dom.askAiBtnText.textContent = isLoading ? "AI 思考中..." : "請 AI 產生/修改";
    dom.aiSpinner.classList.toggle("hidden", !isLoading);
    dom.askAiBtn.classList.toggle("opacity-75", isLoading);
    dom.askAiBtn.classList.toggle("cursor-not-allowed", isLoading);
}

function fillXmlAndRender(xmlText, options = {}) {
    const { persist = true } = options;
    dom.xmlInput.value = xmlText;
    render(xmlText);

    if (persist) {
        writeStoredValue(STORAGE_KEYS.diagramXml, xmlText);
    }
}

async function loadExampleXml() {
    const response = await window.fetch(EXAMPLE_DRAWIO_PATH, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`範例檔案載入失敗 (${response.status})`);
    }

    return response.text();
}

function readStoredValue(key) {
    try {
        return window.localStorage.getItem(key) || "";
    } catch (_error) {
        return "";
    }
}

function writeStoredValue(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (_error) {
        // ignore localStorage write failures (private mode/quota issues)
    }
}

function openGeminiSettingsModal() {
    dom.geminiSettingsModal.classList.remove("hidden");
    dom.geminiSettingsModal.classList.add("flex");
}

function closeGeminiSettingsModal() {
    dom.geminiSettingsModal.classList.add("hidden");
    dom.geminiSettingsModal.classList.remove("flex");
}

function persistGeminiSettings() {
    const apiKey = dom.apiKeyInput.value.trim();
    const model = dom.modelInput.value.trim() || DEFAULT_MODEL_NAME;
    dom.modelInput.value = model;
    writeStoredValue(STORAGE_KEYS.apiKey, apiKey);
    writeStoredValue(STORAGE_KEYS.model, model);
}

function initializeGeminiSettings() {
    const savedApiKey = readStoredValue(STORAGE_KEYS.apiKey);
    const savedModel = readStoredValue(STORAGE_KEYS.model);
    dom.apiKeyInput.value = savedApiKey;
    dom.modelInput.value = savedModel || DEFAULT_MODEL_NAME;
}

async function handleFile(file) {
    if (!isSupportedDiagramFile(file.name)) {
        toast.show("僅支援 .xml 或 .drawio", true);
        return;
    }

    try {
        const text = await readTextFile(file);
        fillXmlAndRender(text);
        toast.show(`載入: ${file.name}`);
    } catch (_error) {
        toast.show("讀取錯誤", true);
    }
}

function registerInputEvents() {
    dom.xmlInput.addEventListener(
        "input",
        debounce(() => {
            fillXmlAndRender(dom.xmlInput.value);
        }, 600)
    );

    dom.formatBtn.addEventListener("click", () => {
        render(dom.xmlInput.value);
        toast.show("已重新渲染");
    });

    dom.loadSampleBtn.addEventListener("click", async () => {
        dom.viewerContainer.innerHTML =
            '<div class="absolute inset-0 flex items-center justify-center text-slate-400 font-medium">重設圖表中...</div>';

        window.setTimeout(async () => {
            try {
                const exampleXml = await loadExampleXml();
                fillXmlAndRender(exampleXml);
                toast.show("已載入範例圖表");
            } catch (_error) {
                toast.show("載入範例失敗", true);
            }
        }, 150);
    });
}

function registerUrlEvents() {
    dom.fetchBtn.addEventListener("click", async () => {
        const url = dom.urlInput.value.trim();
        if (!url) {
            toast.show("請輸入網址", true);
            return;
        }

        setFetchLoading(true);
        try {
            const xmlText = await fetchXmlFromUrl(url);
            fillXmlAndRender(xmlText);
            toast.show("成功載入網址內容");
        } catch (_error) {
            toast.show("載入失敗 (可能為 CORS 限制)", true);
        } finally {
            setFetchLoading(false);
        }
    });
}

function registerFileEvents() {
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

function registerAiEvents() {
    dom.askAiBtn.addEventListener("click", async () => {
        const prompt = dom.aiPrompt.value.trim();
        const currentXml = dom.xmlInput.value.trim();
        const apiKey = dom.apiKeyInput.value.trim() || ENV_API_KEY;
        const model = dom.modelInput.value.trim() || DEFAULT_MODEL_NAME;

        if (!prompt) {
            toast.show("請輸入你想請 AI 修改的需求！", true);
            dom.aiPrompt.focus();
            return;
        }

        if (!apiKey) {
            toast.show("請輸入您的 Gemini API Key", true);
            openGeminiSettingsModal();
            dom.apiKeyInput.focus();
            return;
        }

        dom.modelInput.value = model;
        persistGeminiSettings();

        setAiLoading(true);
        try {
            const resultXml = await requestAiXml({
                prompt,
                currentXml,
                apiKey,
                model
            });
            fillXmlAndRender(resultXml);
            dom.aiPrompt.value = "";
            toast.show("AI 已完成圖表更新！");
        } catch (error) {
            console.error("AI 請求失敗:", error);
            toast.show(`AI 請求失敗: ${error.message}`, true);
        } finally {
            setAiLoading(false);
        }
    });
}

function registerGeminiSettingsEvents() {
    dom.openGeminiSettingsBtn.addEventListener("click", () => {
        openGeminiSettingsModal();
    });

    dom.closeGeminiSettingsBtn.addEventListener("click", () => {
        closeGeminiSettingsModal();
    });

    dom.cancelGeminiSettingsBtn.addEventListener("click", () => {
        closeGeminiSettingsModal();
    });

    dom.geminiSettingsBackdrop.addEventListener("click", () => {
        closeGeminiSettingsModal();
    });

    dom.saveGeminiSettingsBtn.addEventListener("click", () => {
        persistGeminiSettings();
        closeGeminiSettingsModal();
        toast.show("Gemini 設定已儲存");
    });

    dom.apiKeyInput.addEventListener("change", persistGeminiSettings);
    dom.modelInput.addEventListener("change", persistGeminiSettings);

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !dom.geminiSettingsModal.classList.contains("hidden")) {
            closeGeminiSettingsModal();
        }
    });
}

async function initialize() {
    initializeGeminiSettings();
    const storedXml = readStoredValue(STORAGE_KEYS.diagramXml).trim();
    if (storedXml) {
        fillXmlAndRender(storedXml, { persist: false });
    } else {
        try {
            const exampleXml = await loadExampleXml();
            fillXmlAndRender(exampleXml);
        } catch (_error) {
            toast.show("無法載入範例圖表", true);
            render("");
        }
    }

    if (dom.loadingState) {
        dom.loadingState.style.display = "none";
    }

    registerInputEvents();
    registerUrlEvents();
    registerFileEvents();
    registerAiEvents();
    registerGeminiSettingsEvents();
}

window.addEventListener("load", initialize);
