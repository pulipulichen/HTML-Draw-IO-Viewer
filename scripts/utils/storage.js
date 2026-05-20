export function readStoredJson(key, fallbackValue) {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return fallbackValue;
        }
        return JSON.parse(raw);
    } catch (_error) {
        return fallbackValue;
    }
}

export function readStoredValue(key) {
    try {
        return window.localStorage.getItem(key) || "";
    } catch (_error) {
        return "";
    }
}

export function writeStoredValue(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (_error) {
        // ignore localStorage write failures (private mode/quota issues)
    }
}
