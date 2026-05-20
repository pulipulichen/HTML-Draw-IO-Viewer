const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const FALLBACK_DRAWIO_SYSTEM_PROMPT =
    "你是一個精通 Draw.io (mxGraph) XML 結構的專家。使用者的目標是根據他們的要求建立或修改 Draw.io 圖表。請你只回傳純 XML 字串，絕對不要包含任何 Markdown 格式標記（如 ```xml），也不要加上任何多餘的解釋或對話。必須確保輸出的內容是可以直接被 Draw.io 解析的合法 XML，以 <mxfile> 開頭，</mxfile> 結尾。請注意圖表中各節點的座標 x,y 佈局，讓他們看起來是整齊的。若有提供標亮圖，表示只允許修改標亮區域；未標亮區域的節點、連線、文字與座標必須維持不變。";
const FALLBACK_MERMAID_SYSTEM_PROMPT =
    "你是一個精通 Mermaid 與 Draw.io (mxGraph) XML 的圖表編輯與轉換專家。當目前模式是 Mermaid 時，預設必須回傳 Mermaid 原始碼（不是 XML），且不要加入 Markdown code fence 或任何解說。只有在使用者明確要求「轉成 Draw.io / 轉成 XML / 匯出為 drawio」時，才回傳合法 Draw.io XML（以 <mxfile> 開頭、</mxfile> 結尾）。若有提供標亮圖，表示只允許修改標亮區域；未標亮區域的節點、連線、文字與座標必須維持不變。";
const DRAWIO_SYSTEM_PROMPT_URL = new URL("../prompts/system_prompt_drawio.md", import.meta.url);
const MERMAID_SYSTEM_PROMPT_URL = new URL("../prompts/system_prompt_mermaid.md", import.meta.url);
const systemPromptCache = {
    drawio: null,
    mermaid: null
};

async function sleep(delayMs) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, delayMs);
    });
}

async function safeParseError(response) {
    const fallback = `HTTP ${response.status}`;

    try {
        const errorBody = await response.json();
        return errorBody?.error?.message || fallback;
    } catch (_error) {
        return fallback;
    }
}

async function fetchWithRetry(url, options, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                const errorMessage = await safeParseError(response);
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error) {
            if (attempt >= maxRetries - 1) {
                throw error;
            }

            console.warn(`Retry ${attempt + 1}...`, error);
            await sleep(RETRY_DELAYS[attempt]);
        }
    }

    throw new Error("AI 請求失敗");
}

function buildReferenceContext(referenceFiles = []) {
    if (!referenceFiles.length) {
        return "";
    }

    const referencesText = referenceFiles
        .map((file, index) => {
            const fileName = file.name || `reference-${index + 1}.txt`;
            return `### 參考檔案 ${index + 1}: ${fileName}\n${file.content}`;
        })
        .join("\n\n");

    return `\n\n以下是可參考的附加檔案內容，請依需求酌量使用：\n${referencesText}`;
}

function buildUserPrompt(
    currentXml,
    prompt,
    referenceFiles = [],
    highlightContext = null,
    diagramReferenceImage = null,
    sourceFormat = "drawio"
) {
    const referenceContext = buildReferenceContext(referenceFiles);
    let diagramReferenceHint = "";
    if (diagramReferenceImage && !highlightContext) {
        diagramReferenceHint =
            "\n\n另外我附上一張目前圖表快照，請把它當成結構與連線的視覺參考，避免轉換後遺漏節點或關係。";
    }
    let selectedRegionHint = "";
    if (highlightContext) {
        const width = Number.isFinite(highlightContext.width) ? highlightContext.width : 0;
        const height = Number.isFinite(highlightContext.height) ? highlightContext.height : 0;
        const highlightCount = Number.isFinite(highlightContext.highlightCount) ? highlightContext.highlightCount : 0;
        selectedRegionHint =
            "\n\n另外我提供了兩張圖片：" +
            "\n1) 目前整張圖表截圖（完整內容）" +
            "\n2) 同一張圖但有標亮區域（這些區域才是允許修改的位置）" +
            `\n標亮快照資訊：${width}x${height}px，${highlightCount} 個標亮區塊` +
            "\n這是一個「局部修改」任務：你只能修改標亮區域。" +
            "\n禁止修改未標亮區域的任何節點、連線、文字內容、樣式、ID、階層與座標。" +
            "\n請盡量維持原始 XML 結構，只對標亮區域做必要最小變更。";
    }

    if (currentXml) {
        if (sourceFormat === "mermaid") {
            return `這是我目前的 Mermaid 語法:\n\n${currentXml}\n\n請直接修改 Mermaid 原始碼並回傳完整結果。除非我明確要求轉成 Draw.io/XML，否則不要回傳 XML。使用者的需求：${prompt}${referenceContext}${diagramReferenceHint}${selectedRegionHint}`;
        }
        return `這是我目前的 Draw.io XML 程式碼:\n\n${currentXml}\n\n使用者的修改需求：${prompt}${referenceContext}${diagramReferenceHint}${selectedRegionHint}`;
    }

    if (sourceFormat === "mermaid") {
        return `目前任務是 Mermaid 模式。預設請回傳 Mermaid 原始碼；只有在我明確要求轉成 Draw.io/XML 時才回傳 Draw.io XML。使用者的需求：${prompt}${referenceContext}${diagramReferenceHint}${selectedRegionHint}`;
    }

    return `請幫我產生一個全新的 Draw.io 圖表。使用者的需求：${prompt}${referenceContext}${diagramReferenceHint}${selectedRegionHint}`;
}

function toInlineImagePart(image) {
    if (!image?.dataUrl || !image?.mimeType) {
        return null;
    }

    const [, base64Data = ""] = image.dataUrl.split(",", 2);
    if (!base64Data) {
        return null;
    }

    return {
        inline_data: {
            mime_type: image.mimeType,
            data: base64Data
        }
    };
}

function getInlineImageParts(highlightContext) {
    if (!highlightContext) {
        return [];
    }

    const parts = [];
    const fullImagePart = toInlineImagePart(highlightContext.fullImage);
    const highlightedImagePart = toInlineImagePart(highlightContext.highlightedImage || highlightContext);

    if (fullImagePart) {
        parts.push(fullImagePart);
    }
    if (highlightedImagePart) {
        parts.push(highlightedImagePart);
    }
    return parts;
}

function sanitizeXmlText(resultText) {
    return resultText
        .replace(/^```[a-zA-Z0-9_-]*\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
}

function extractAiText(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const textParts = [];

    candidates.forEach((candidate) => {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        parts.forEach((part) => {
            if (typeof part?.text === "string" && part.text.trim()) {
                textParts.push(part.text);
            }
        });
    });

    if (textParts.length) {
        return textParts.join("\n").trim();
    }

    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) {
        throw new Error(`AI 回應被安全規則阻擋（${blockReason}）`);
    }

    const firstFinishReason = candidates[0]?.finishReason;
    if (firstFinishReason) {
        throw new Error(`AI 未回傳可用內容（finishReason: ${firstFinishReason}）`);
    }

    throw new Error("AI 回應格式錯誤：缺少文字內容");
}

function normalizeSourceFormat(sourceFormat = "drawio") {
    return sourceFormat === "mermaid" ? "mermaid" : "drawio";
}

function resolveSystemPromptConfig(sourceFormat = "drawio") {
    const normalized = normalizeSourceFormat(sourceFormat);
    if (normalized === "mermaid") {
        return {
            format: "mermaid",
            url: MERMAID_SYSTEM_PROMPT_URL,
            fallback: FALLBACK_MERMAID_SYSTEM_PROMPT
        };
    }
    return {
        format: "drawio",
        url: DRAWIO_SYSTEM_PROMPT_URL,
        fallback: FALLBACK_DRAWIO_SYSTEM_PROMPT
    };
}

async function loadSystemPrompt(sourceFormat = "drawio") {
    const config = resolveSystemPromptConfig(sourceFormat);
    if (systemPromptCache[config.format]) {
        return systemPromptCache[config.format];
    }

    try {
        const response = await fetch(config.url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const text = (await response.text()).trim();
        systemPromptCache[config.format] = text || config.fallback;
        return systemPromptCache[config.format];
    } catch (error) {
        console.warn(`讀取 ${config.format} system prompt 失敗，改用預設提示詞。`, error);
        systemPromptCache[config.format] = config.fallback;
        return systemPromptCache[config.format];
    }
}

export async function requestAiXml({
    prompt,
    currentXml,
    apiKey,
    model,
    referenceFiles = [],
    selectedRegionImage = null,
    diagramReferenceImage = null,
    sourceFormat = "drawio"
}) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const userPrompt = buildUserPrompt(
        currentXml,
        prompt,
        referenceFiles,
        selectedRegionImage,
        diagramReferenceImage,
        sourceFormat
    );
    const systemPrompt = await loadSystemPrompt(sourceFormat);
    const contentParts = [{ text: userPrompt }];
    const diagramReferenceImagePart = toInlineImagePart(diagramReferenceImage);
    if (diagramReferenceImagePart) {
        contentParts.push(diagramReferenceImagePart);
    }
    contentParts.push(...getInlineImageParts(selectedRegionImage));
    const payload = {
        contents: [{ parts: contentParts }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    const data = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const resultText = extractAiText(data);
    return sanitizeXmlText(resultText);
}
