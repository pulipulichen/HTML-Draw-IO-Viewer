import { expect, test } from "@playwright/test";

const DIAGRAM_XML_STORAGE_KEY = "drawio-viewer-diagram-xml";

function trackConsoleErrors(page) {
    const errors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") {
            errors.push(msg.text());
        }
    });
    return errors;
}

async function resetStoredDiagram(page) {
    await page.addInitScript((storageKey) => {
        window.localStorage.removeItem(storageKey);
    }, DIAGRAM_XML_STORAGE_KEY);
}

test("toggles minimap panel visibility", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await resetStoredDiagram(page);

    await page.goto("/");

    const minimapPanel = page.locator('[data-viewer-role="minimap-panel"]');
    const minimapToggle = page.locator('[data-viewer-role="minimap-toggle"]');

    await expect(minimapToggle).toBeVisible();
    await expect(minimapPanel).toBeVisible();

    await minimapToggle.click();
    await expect(minimapPanel).toBeHidden();

    await minimapToggle.click();
    await expect(minimapPanel).toBeVisible();

    await page.waitForLoadState("domcontentloaded");
    expect(consoleErrors).toHaveLength(0);
});

test("clicking minimap updates diagram transform", async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await resetStoredDiagram(page);

    await page.goto("/");

    const minimapPanel = page.locator('[data-viewer-role="minimap-panel"]');
    await expect(minimapPanel).toBeVisible();

    const transformBefore = await page.evaluate(() => {
        const host = document.querySelector('[data-viewer-role="diagram-host"]');
        if (!(host instanceof HTMLElement)) {
            return null;
        }

        const target = Array.from(host.querySelectorAll("*")).find(
            (el) => el instanceof HTMLElement && el.style.transform.includes("scale(")
        );

        if (!(target instanceof HTMLElement)) {
            return null;
        }

        return target.style.transform;
    });

    expect(transformBefore).not.toBeNull();

    await minimapPanel.click({ position: { x: 8, y: 8 } });

    await expect
        .poll(async () => {
            return page.evaluate(() => {
                const host = document.querySelector('[data-viewer-role="diagram-host"]');
                if (!(host instanceof HTMLElement)) {
                    return null;
                }

                const target = Array.from(host.querySelectorAll("*")).find(
                    (el) => el instanceof HTMLElement && el.style.transform.includes("scale(")
                );

                if (!(target instanceof HTMLElement)) {
                    return null;
                }

                return target.style.transform;
            });
        })
        .not.toBe(transformBefore);

    await page.waitForLoadState("domcontentloaded");
    expect(consoleErrors).toHaveLength(0);
});
