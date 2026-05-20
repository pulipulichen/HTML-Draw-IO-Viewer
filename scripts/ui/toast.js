export function createToastController(toastElement) {
    let toastTimeoutId;

    function show(message, isError = false) {
        toastElement.textContent = message;
        toastElement.className =
            `absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm transition-opacity duration-300 z-50 ${isError ? "bg-red-600 text-white" : "bg-slate-800 text-white"}`;
        toastElement.style.opacity = "1";

        clearTimeout(toastTimeoutId);
        toastTimeoutId = window.setTimeout(() => {
            toastElement.style.opacity = "0";
        }, 3000);
    }

    return {
        show
    };
}
