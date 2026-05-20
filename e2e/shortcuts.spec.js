import { expect, test } from "@playwright/test";

function trackConsoleErrors(page) {
    const consoleErrors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            consoleErrors.push(msg.text());
        }
    });
    return consoleErrors;
}

async function gotoApp(page) {
    await page.goto("/");
    await expect(page.locator("#viewerContainer [data-viewer-role='diagram-host']")).toHaveCount(1);
    await expect(page.locator("#xmlInput")).not.toHaveValue("");
}

async function getViewerScale(page) {
    return page.evaluate(() => {
        const host = document.querySelector("#viewerContainer [data-viewer-role='diagram-host']");
        if (!(host instanceof HTMLElement)) {
            return null;
        }

        const transformTarget =
            host.querySelector(".geDiagramContainer") ||
            host.querySelector(".mxGraphContainer") ||
            host.querySelector("svg")?.parentElement ||
            host.firstElementChild ||
            host;

        if (!(transformTarget instanceof HTMLElement)) {
            return null;
        }

        const transform = transformTarget.style.transform || "";
        const match = transform.match(/scale\(([^)]+)\)/);
        if (!match) {
            return null;
        }

        const value = Number.parseFloat(match[1]);
        return Number.isFinite(value) ? value : null;
    });
}

test("opens and closes shortcuts help with keyboard keys", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await gotoApp(page);

    const shortcutsModal = page.locator("#shortcutsModal");
    await expect(shortcutsModal).toHaveClass(/hidden/);

    await page.keyboard.press("Shift+Slash");
    await expect(shortcutsModal).not.toHaveClass(/hidden/);

    await page.keyboard.press("Escape");
    await expect(shortcutsModal).toHaveClass(/hidden/);

    await page.click("#xmlInput");
    await page.keyboard.press("Shift+Slash");
    await expect(shortcutsModal).toHaveClass(/hidden/);

    expect(consoleErrors).toHaveLength(0);
});

test("switches highlight action with i and d, then clears with e", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await gotoApp(page);

    await page.click("#viewerContainer");
    const highlightModeSelect = page.locator("#highlightModeSelect");
    const addHighlightBtn = page.locator("#addHighlightBtn");
    const eraseHighlightBtn = page.locator("#eraseHighlightBtn");

    await page.keyboard.press("i");
    await expect(addHighlightBtn).toHaveClass(/bg-blue-600/);
    await expect(highlightModeSelect).toHaveClass(/ring-2/);

    await page.keyboard.press("d");
    await expect(eraseHighlightBtn).toHaveClass(/bg-rose-600/);
    await expect(addHighlightBtn).not.toHaveClass(/bg-blue-600/);

    await page.keyboard.press("e");
    await expect(highlightModeSelect).not.toHaveClass(/ring-2/);
    await expect(eraseHighlightBtn).not.toHaveClass(/bg-rose-600/);

    expect(consoleErrors).toHaveLength(0);
});

test("zooms in and out, then resets view with keyboard shortcuts", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await gotoApp(page);

    await page.click("#viewerContainer");

    const initialScale = await getViewerScale(page);
    expect(initialScale).not.toBeNull();
    const baselineScale = initialScale ?? 1;

    await page.keyboard.press("Shift+Equal");
    await expect.poll(async () => (await getViewerScale(page)) ?? -1, { timeout: 5000 }).toBeGreaterThan(
        baselineScale
    );

    const zoomInScale = await getViewerScale(page);
    expect(zoomInScale).not.toBeNull();
    const zoomedScale = zoomInScale ?? baselineScale;

    await page.keyboard.press("Minus");
    await expect.poll(async () => (await getViewerScale(page)) ?? Number.POSITIVE_INFINITY, { timeout: 5000 })
        .toBeLessThan(zoomedScale);

    await page.keyboard.press("Slash");
    await expect
        .poll(async () => {
            const value = await getViewerScale(page);
            if (value === null) {
                return Number.POSITIVE_INFINITY;
            }
            return Math.abs(value - baselineScale);
        }, { timeout: 5000 })
        .toBeLessThan(0.05);

    expect(consoleErrors).toHaveLength(0);
});

test("triggers xml download with ctrl+s", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await gotoApp(page);

    await page.click("#viewerContainer");
    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press("Control+s");
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.(drawio|xml)$/);
    expect(consoleErrors).toHaveLength(0);
});
