export function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    window.addEventListener("load", () => {
        let hasRefreshedAfterSwUpdate = false;

        navigator.serviceWorker
            .register("./service-worker.js")
            .then((registration) => {
                registration.update();
            })
            .catch((error) => {
                console.warn("Service worker registration failed:", error);
            });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (hasRefreshedAfterSwUpdate) {
                return;
            }

            hasRefreshedAfterSwUpdate = true;
            window.location.reload();
        });
    });
}
