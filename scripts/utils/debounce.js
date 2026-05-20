export function debounce(callback, delayMs) {
    let timeoutId;

    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => callback(...args), delayMs);
    };
}
