function looksLikeDrawioXml(sourceText) {
    const text = sourceText.trim();
    if (!text.startsWith("<")) {
        return false;
    }
    return /<mxfile[\s>]|<mxGraphModel[\s>]|<diagram[\s>]/i.test(text);
}

function looksLikeMermaid(sourceText) {
    const text = sourceText.trim();
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
