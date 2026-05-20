import { expect, test } from "@playwright/test";

const LANGUAGE_KEY = "drawio-viewer-language";

test("loads with browser-detected or stored language and renders diagram UI", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            consoleErrors.push(msg.text());
        }
    });

    await page.goto("/");

    await expect(page.locator("#languageSelect")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", /^(en|zh-TW)$/);
    await expect(page.locator("#viewerContainer .mxgraph")).toHaveCount(1);
    await expect(page.locator("#formatBtn")).toBeVisible();
    await expect(page.locator("#loadSampleBtn")).toBeVisible();

    await page.waitForLoadState("domcontentloaded");
    expect(consoleErrors).toHaveLength(0);
});

test("switches language to zh-TW and updates persisted state", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            consoleErrors.push(msg.text());
        }
    });

    await page.goto("/");
    await page.selectOption("#languageSelect", "zh-TW");

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    await expect(page.locator("[data-i18n='editor.rerenderBtn']")).toHaveText("重新渲染");
    await expect(page.locator("[data-i18n='import.loadBtn']")).toHaveText("載入");
    await expect(page.locator("[data-i18n='ai.settingsBtn']")).toHaveText("Gemini 設定");

    const storedLanguage = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), LANGUAGE_KEY);
    expect(storedLanguage).toBe("zh-TW");

    await page.waitForLoadState("domcontentloaded");
    expect(consoleErrors).toHaveLength(0);
});

test("persists selected language after reload", async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            consoleErrors.push(msg.text());
        }
    });

    await page.addInitScript((storageKey) => {
        window.localStorage.setItem(storageKey, "en");
    }, LANGUAGE_KEY);

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#languageSelect")).toHaveValue("en");

    await page.selectOption("#languageSelect", "zh-TW");
    await expect(page.locator("#languageSelect")).toHaveValue("zh-TW");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    await expect(page.locator("#languageSelect")).toHaveValue("zh-TW");

    await page.waitForLoadState("domcontentloaded");
    expect(consoleErrors).toHaveLength(0);
});
