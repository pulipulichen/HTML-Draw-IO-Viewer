/* global self, caches */

const CACHE_VERSION = "v2";
const APP_CACHE = `drawio-ai-editor-${CACHE_VERSION}`;
const APP_SHELL_FILES = [
    "./",
    "./index.html",
    "./manifest.json",
    "./styles/main.css",
    "./demo/example.drawio",
    "./demo/example.mmd",
    "./scripts/app.js",
    "./scripts/constants.js",
    "./scripts/core/viewer.js",
    "./scripts/modules/i18n.js",
    "./scripts/modules/i18n/en.js",
    "./scripts/modules/i18n/zh-TW.js",
    "./scripts/prompts/system_prompt.md",
    "./scripts/services/aiService.js",
    "./scripts/services/fileService.js",
    "./scripts/services/networkService.js",
    "./scripts/ui/toast.js",
    "./scripts/utils/debounce.js",
    "./scripts/utils/dom.js",
    "./assets/favicon/favicon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES)).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName.startsWith("drawio-ai-editor-") && cacheName !== APP_CACHE)
                    .map((cacheName) => caches.delete(cacheName))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(event.request.url);
    const isSameOrigin = requestUrl.origin === self.location.origin;

    // Keep app scripts/styles fresh; fallback to cache when offline.
    if (isSameOrigin) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    const responseToCache = networkResponse.clone();
                    caches.open(APP_CACHE).then((cache) => cache.put(event.request, responseToCache));
                    return networkResponse;
                })
                .catch(() =>
                    caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }

                        if (event.request.mode === "navigate") {
                            return caches.match("./index.html");
                        }

                        return new Response("", { status: 503, statusText: "Offline" });
                    })
                )
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request)
                .then((networkResponse) => {
                    return networkResponse;
                })
                .catch(() => {
                    if (event.request.mode === "navigate") {
                        return caches.match("./index.html");
                    }
                    return new Response("", { status: 503, statusText: "Offline" });
                });
        })
    );
});
