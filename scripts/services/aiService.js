const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const FALLBACK_SYSTEM_PROMPT =
    "你是一個精通 Draw.io (mxGraph) XML 結構的專家。使用者的目標是根據他們的要求建立或修改 Draw.io 圖表。請你只回傳純 XML 字串，絕對不要包含任何 Markdown 格式標記（如 ```xml），也不要加上任何多餘的解釋或對話。必須確保輸出的內容是可以直接被 Draw.io 解析的合法 XML，以 <mxfile> 開頭，</mxfile> 結尾。請注意圖表中各節點的座標 x,y 佈局，讓他們看起來是整齊的。";
const SYSTEM_PROMPT_URL = new URL("../prompts/system_prompt.md", import.meta.url);
let systemPromptCache;

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
    hasHighlightContext = false,
    sourceFormat = "drawio"
) {
    const referenceContext = buildReferenceContext(referenceFiles);
    let selectedRegionHint = "";
    if (hasHighlightContext) {
        selectedRegionHint =
            "\n\n另外我提供了兩張圖片：" +
            "\n1) 目前整張圖表截圖（完整內容）" +
            "\n2) 同一張圖但有標亮區域（代表希望優先修改處）" +
            "\n請優先針對標亮處調整，但仍要保持整張圖的一致性。";
    }

    if (currentXml) {
        if (sourceFormat === "mermaid") {
            return `這是我目前的 Mermaid 語法:\n\n${currentXml}\n\n請根據需求產生對應的 Draw.io XML。使用者的需求：${prompt}${referenceContext}${selectedRegionHint}`;
        }
        return `這是我目前的 Draw.io XML 程式碼:\n\n${currentXml}\n\n使用者的修改需求：${prompt}${referenceContext}${selectedRegionHint}`;
    }

    return `請幫我產生一個全新的 Draw.io 圖表。使用者的需求：${prompt}${referenceContext}${selectedRegionHint}`;
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
        .replace(/^```(xml)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
}

async function loadSystemPrompt() {
    if (systemPromptCache) {
        return systemPromptCache;
    }

    try {
        const response = await fetch(SYSTEM_PROMPT_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const text = (await response.text()).trim();
        systemPromptCache = text || FALLBACK_SYSTEM_PROMPT;
        return systemPromptCache;
    } catch (error) {
        console.warn("讀取 system_prompt.md 失敗，改用預設提示詞。", error);
        systemPromptCache = FALLBACK_SYSTEM_PROMPT;
        return systemPromptCache;
    }
}

export async function requestAiXml({
    prompt,
    currentXml,
    apiKey,
    model,
    referenceFiles = [],
    selectedRegionImage = null,
    sourceFormat = "drawio"
}) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const hasSelectedRegionImage = Boolean(selectedRegionImage);
    const userPrompt = buildUserPrompt(
        currentXml,
        prompt,
        referenceFiles,
        hasSelectedRegionImage,
        sourceFormat
    );
    const systemPrompt = await loadSystemPrompt();
    const contentParts = [{ text: userPrompt }];
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

    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
        throw new Error("AI 回應格式錯誤");
    }

    return sanitizeXmlText(resultText);
}
