export function extractMermaidFromMarkdown(sourceText) {
    const text = String(sourceText ?? "").trim();
    if (!text) {
        return { text, extracted: false };
    }

    const mermaidFenceMatch = text.match(/```mermaid\s*([\s\S]*?)```/i);
    if (mermaidFenceMatch?.[1]) {
        return {
            text: mermaidFenceMatch[1].trim(),
            extracted: true
        };
    }

    const mermaidContainerMatch = text.match(/:::\s*mermaid\s*([\s\S]*?):::/i);
    if (mermaidContainerMatch?.[1]) {
        return {
            text: mermaidContainerMatch[1].trim(),
            extracted: true
        };
    }

    return { text, extracted: false };
}

function looksLikeDrawioXml(sourceText) {
    const text = sourceText.trim();
    if (!text.startsWith("<")) {
        return false;
    }
    return /<mxfile[\s>]|<mxGraphModel[\s>]|<diagram[\s>]/i.test(text);
}

function looksLikeMermaid(sourceText) {
    const text = extractMermaidFromMarkdown(sourceText).text;
    if (!text || text.startsWith("<")) {
        return false;
    }

    if (/^```mermaid\b/i.test(text) || /^:::\s*mermaid\b/i.test(text)) {
        return true;
    }

    return /^(%%\{init:|graph\s+(TD|TB|BT|LR|RL)|flowchart\s+(TD|TB|BT|LR|RL)|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|kanban|packet-beta|block-beta)/m.test(
        text
    );
}

export function detectDiagramSourceFormat(sourceText) {
    if (looksLikeDrawioXml(sourceText)) {
        return "drawio";
    }
    if (looksLikeMermaid(sourceText)) {
        return "mermaid";
    }
    return null;
}

export function resolveRenderFormat(sourceText, formatHint = "auto") {
    if (formatHint === "drawio") {
        return "drawio";
    }
    if (formatHint === "mermaid") {
        return "mermaid";
    }
    return detectDiagramSourceFormat(sourceText) || "drawio";
}
