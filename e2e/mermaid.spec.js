import path from "node:path";
import { expect, test } from "@playwright/test";

function trackConsoleErrors(page) {
    const errors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            errors.push(msg.text());
        }
    });
    return errors;
}

test("renders Mermaid source and shows conversion button", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await page.goto("/");

    await page.selectOption("#sourceFormatSelect", "mermaid");
    await page.fill(
        "#xmlInput",
        [
            "flowchart TD",
            "    A[Start] --> B{Is Mermaid?}",
            "    B -- Yes --> C[Render Mermaid]",
            "    B -- No --> D[Render Draw.io]"
        ].join("\n")
    );
    await page.click("#formatBtn");

    await expect(page.locator("#viewerContainer [data-viewer-role='diagram-host'] svg")).toBeVisible();
    await expect(page.locator("#convertMermaidBtn")).toBeVisible();

    await page.selectOption("#sourceFormatSelect", "drawio");
    await page.click("#formatBtn");
    await expect(page.locator("#convertMermaidBtn")).toBeHidden();

    expect(consoleErrors).toHaveLength(0);
});

test("loads .mmd file and keeps mermaid format behavior", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await page.goto("/");

    const samplePath = path.join(process.cwd(), "demo", "example.mmd");
    await page.setInputFiles("#fileInput", samplePath);

    await expect(page.locator("#sourceFormatSelect")).toHaveValue("mermaid");
    await expect(page.locator("#xmlInput")).toContainText("flowchart TD");
    await expect(page.locator("#viewerContainer [data-viewer-role='diagram-host'] svg")).toBeVisible();
    await expect(page.locator("#convertMermaidBtn")).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
});
