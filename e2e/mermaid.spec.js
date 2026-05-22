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
    await expect(page.locator("#viewerContainer [data-viewer-role='diagram-host']")).toHaveCount(1);
    await expect(page.locator("#xmlInput")).not.toHaveValue("");

    // 避免觸發 sourceFormatSelect 的 change handler（會非同步載入範例並覆蓋輸入），
    // 這裡只設定 format hint，接著由 formatBtn 觸發一次明確 rerender。
    await page.evaluate(() => {
        const select = document.querySelector("#sourceFormatSelect");
        if (select instanceof HTMLSelectElement) {
            select.value = "mermaid";
        }
    });
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

    await expect(page.locator("#viewerContainer [data-viewer-role='diagram-host'] svg")).toBeVisible({
        timeout: 10000
    });

    // convertMermaidBtn 位於 AI 分頁面板內，需先切到該分頁才會真的顯示出來
    await page.click("#aiTabBtn");
    await expect(page.locator("#convertMermaidBtn")).toBeVisible();

    // 切回編輯器分頁才能操作 sourceFormatSelect / formatBtn；
    // 先清空 xmlInput 再切到 drawio 模式，避免把 Mermaid 內容餵給 drawio viewer
    // (viewer-static.min.js 會在 console 印出 "Not a diagram file" 影響 consoleErrors 斷言)
    await page.click("#editorTabBtn");
    await page.click("#clearXmlBtn");
    await page.selectOption("#sourceFormatSelect", "drawio");
    await expect(page.locator("#convertMermaidBtn")).toBeHidden();

    expect(consoleErrors).toHaveLength(0);
});

test("loads .mmd file and keeps mermaid format behavior", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await page.goto("/");
    await expect(page.locator("#viewerContainer [data-viewer-role='diagram-host']")).toHaveCount(1);
    await expect(page.locator("#xmlInput")).not.toHaveValue("");

    const samplePath = path.join(process.cwd(), "demo", "mermaid_example1.mmd");
    page.on("dialog", (dialog) => {
        dialog.accept().catch(() => {});
    });
    await page.setInputFiles("#fileInput", samplePath);

    await expect(page.locator("#sourceFormatSelect")).toHaveValue("mermaid");
    // textarea 的 value 必須用 toHaveValue 檢查（toContainText 只看 textContent，無法反映程式化設定的 value）
    await expect(page.locator("#xmlInput")).toHaveValue(/flowchart TD/);
    await expect(page.locator("#viewerContainer [data-viewer-role='diagram-host'] svg")).toBeVisible();

    await page.click("#aiTabBtn");
    await expect(page.locator("#convertMermaidBtn")).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
});
