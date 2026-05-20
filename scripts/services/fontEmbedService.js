const EMBED_FONT_URL = "./assets/fonts/NotoSansTC-wght.ttf";
const EMBED_FONT_FORMAT = "truetype";
const DATA_URI_CACHE_NAME = "drawio-embedded-font-data-uri-v1";
const DATA_URI_CACHE_KEY = "./assets/fonts/NotoSansTC-wght.ttf.data-uri.txt";

let embeddedFontDataUriPromise = null;

function blobToDataUri(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("font data uri conversion failed"));
        reader.readAsDataURL(blob);
    });
}

async function readCachedFontDataUri() {
    if (typeof window === "undefined" || !window.caches) {
        return null;
    }
    try {
        const cache = await window.caches.open(DATA_URI_CACHE_NAME);
        const cachedResponse = await cache.match(DATA_URI_CACHE_KEY);
        if (!cachedResponse) {
            return null;
        }
        const cachedDataUri = (await cachedResponse.text()).trim();
        return cachedDataUri || null;
    } catch (_error) {
        return null;
    }
}

async function writeCachedFontDataUri(dataUri) {
    if (typeof window === "undefined" || !window.caches) {
        return;
    }
    try {
        const cache = await window.caches.open(DATA_URI_CACHE_NAME);
        await cache.put(
            DATA_URI_CACHE_KEY,
            new Response(dataUri, {
                headers: {
                    "content-type": "text/plain;charset=utf-8"
                }
            })
        );
    } catch (_error) {
        // Cache write failures should not block export.
    }
}

export async function getEmbeddedNotoSansTcFontDataUri() {
    if (!embeddedFontDataUriPromise) {
        embeddedFontDataUriPromise = (async () => {
            const cachedDataUri = await readCachedFontDataUri();
            if (cachedDataUri) {
                return cachedDataUri;
            }

            const response = await window.fetch(EMBED_FONT_URL, { cache: "force-cache" });
            if (!response.ok) {
                throw new Error(`embedded font fetch failed (${response.status})`);
            }

            const blob = await response.blob();
            const dataUri = await blobToDataUri(blob);
            const normalizedDataUri = dataUri.replace(/^data:[^;]+;/i, `data:font/${EMBED_FONT_FORMAT};`);
            await writeCachedFontDataUri(normalizedDataUri);
            return normalizedDataUri;
        })().catch((error) => {
            embeddedFontDataUriPromise = null;
            throw error;
        });
    }
    return embeddedFontDataUriPromise;
}
