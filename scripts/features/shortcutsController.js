export function createShortcutsController(options) {
    const { dom, viewer } = options;

    function openShortcutsModal() {
        dom.shortcutsModal.classList.remove("hidden");
        dom.shortcutsModal.classList.add("flex");
    }

    function closeShortcutsModal() {
        dom.shortcutsModal.classList.add("hidden");
        dom.shortcutsModal.classList.remove("flex");
    }

    function isEditableTarget(target) {
        if (!(target instanceof HTMLElement)) {
            return false;
        }
        if (target.isContentEditable) {
            return true;
        }
        const tagName = target.tagName.toLowerCase();
        return tagName === "input" || tagName === "textarea" || tagName === "select";
    }

    function registerShortcutsModalEvents() {
        dom.openShortcutsBtn.addEventListener("click", openShortcutsModal);
        dom.closeShortcutsBtn.addEventListener("click", closeShortcutsModal);
        dom.shortcutsBackdrop.addEventListener("click", closeShortcutsModal);
    }

    function registerKeyboardShortcuts() {
        window.addEventListener("keydown", (event) => {
            const isSaveShortcut =
                (event.ctrlKey || event.metaKey) &&
                !event.altKey &&
                event.key.toLowerCase() === "s";
            if (isSaveShortcut) {
                event.preventDefault();
                dom.downloadXmlBtn.click();
                return;
            }

            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }
            if (isEditableTarget(event.target)) {
                return;
            }
            if (event.key === "?") {
                event.preventDefault();
                openShortcutsModal();
                return;
            }
            if (isOpen()) {
                return;
            }

            const lowerKey = event.key.toLowerCase();
            if (lowerKey === "i") {
                event.preventDefault();
                dom.addHighlightBtn.click();
                return;
            }
            if (lowerKey === "d") {
                event.preventDefault();
                dom.eraseHighlightBtn.click();
                return;
            }
            if (lowerKey === "e") {
                event.preventDefault();
                dom.clearHighlightsBtn.click();
                return;
            }

            const isZoomInKey =
                event.key === "+" || (event.key === "=" && event.shiftKey) || event.code === "NumpadAdd";
            if (isZoomInKey) {
                event.preventDefault();
                viewer.zoomIn();
                return;
            }

            const isZoomOutKey = event.key === "-" || event.key === "_" || event.code === "NumpadSubtract";
            if (isZoomOutKey) {
                event.preventDefault();
                viewer.zoomOut();
                return;
            }

            if (event.key === "/") {
                event.preventDefault();
                viewer.resetView();
            }
        });
    }

    function isOpen() {
        return !dom.shortcutsModal.classList.contains("hidden");
    }

    return {
        close: closeShortcutsModal,
        isOpen,
        open: openShortcutsModal,
        registerKeyboardShortcuts,
        registerShortcutsModalEvents
    };
}
