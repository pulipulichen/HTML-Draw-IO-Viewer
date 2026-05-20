const TRANSLATIONS = window.I18N_TRANSLATIONS || {};
const STORAGE_KEY = "drawio-viewer-language";
const DEFAULT_LANGUAGE = "en";
const listeners = new Set();
let languageSelectRef = null;

let currentLanguage = DEFAULT_LANGUAGE;

function readStoredLanguage() {
    try {
        return window.localStorage.getItem(STORAGE_KEY) || "";
    } catch (_error) {
        return "";
    }
}

function writeStoredLanguage(language) {
    try {
        window.localStorage.setItem(STORAGE_KEY, language);
    } catch (_error) {
        // Ignore localStorage write errors
    }
}

function getSupportedLanguages() {
    return Object.keys(TRANSLATIONS);
}

function resolveLanguage(inputLanguage) {
    const supportedLanguages = getSupportedLanguages();
    if (!supportedLanguages.length) {
        return DEFAULT_LANGUAGE;
    }

    if (!inputLanguage) {
        return supportedLanguages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : supportedLanguages[0];
    }

    if (supportedLanguages.includes(inputLanguage)) {
        return inputLanguage;
    }

    const lowerInput = inputLanguage.toLowerCase();
    const exactIgnoreCase = supportedLanguages.find((language) => language.toLowerCase() === lowerInput);
    if (exactIgnoreCase) {
        return exactIgnoreCase;
    }

    const inputBase = lowerInput.split("-")[0];
    const baseMatched = supportedLanguages.find((language) => language.toLowerCase().split("-")[0] === inputBase);
    if (baseMatched) {
        return baseMatched;
    }

    return supportedLanguages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : supportedLanguages[0];
}

function resolveLanguageFromNavigator() {
    const browserLanguages = [...(navigator.languages || []), navigator.language].filter(Boolean);
    for (const language of browserLanguages) {
        const resolvedLanguage = resolveLanguage(language);
        if (resolvedLanguage) {
            return resolvedLanguage;
        }
    }
    return resolveLanguage(DEFAULT_LANGUAGE);
}

function resolveInitialLanguage() {
    const storedLanguage = readStoredLanguage();
    if (storedLanguage) {
        return resolveLanguage(storedLanguage);
    }

    return resolveLanguageFromNavigator();
}

function getCurrentDictionary() {
    return TRANSLATIONS[currentLanguage] || {};
}

function getFallbackDictionary() {
    return TRANSLATIONS[DEFAULT_LANGUAGE] || {};
}

export function t(key, fallbackText = "") {
    const dictionary = getCurrentDictionary();
    if (key in dictionary) {
        return dictionary[key];
    }

    const fallbackDictionary = getFallbackDictionary();
    if (key in fallbackDictionary) {
        return fallbackDictionary[key];
    }

    return fallbackText || key;
}

export function applyTranslations(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((element) => {
        const key = element.dataset.i18n;
        if (key) {
            element.textContent = t(key);
        }
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
        const key = element.dataset.i18nPlaceholder;
        if (key) {
            element.setAttribute("placeholder", t(key));
        }
    });

    root.querySelectorAll("[data-i18n-title]").forEach((element) => {
        const key = element.dataset.i18nTitle;
        if (key) {
            element.setAttribute("title", t(key));
            element.setAttribute("aria-label", t(key));
        }
    });

    document.title = t("meta.title", document.title);
}

export function getLanguage() {
    return currentLanguage;
}

export function setLanguage(nextLanguage, options = {}) {
    const { persist = true, notify = true } = options;
    const resolvedLanguage = resolveLanguage(nextLanguage);
    currentLanguage = resolvedLanguage;

    document.documentElement.setAttribute("lang", resolvedLanguage);
    applyTranslations();
    renderLanguageSelect();

    if (persist) {
        writeStoredLanguage(resolvedLanguage);
    }

    if (notify) {
        listeners.forEach((listener) => listener(resolvedLanguage));
    }
}

export function onLanguageChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function setupLanguageSelect(languageSelect) {
    languageSelectRef = languageSelect;
    if (!languageSelectRef) {
        return;
    }

    if (!languageSelectRef.dataset.i18nBound) {
        languageSelectRef.addEventListener("change", (event) => {
            const nextLanguage = String(event.target.value || "");
            setLanguage(nextLanguage);
        });
        languageSelectRef.dataset.i18nBound = "true";
    }

    renderLanguageSelect();
}

function renderLanguageSelect() {
    if (!languageSelectRef) {
        return;
    }

    const supportedLanguages = getSupportedLanguages();
    languageSelectRef.innerHTML = "";

    supportedLanguages.forEach((language) => {
        const option = document.createElement("option");
        option.value = language;
        option.textContent = t(`language.${language}`, language);
        languageSelectRef.appendChild(option);
    });

    languageSelectRef.value = currentLanguage;
}

export function initializeI18n(options = {}) {
    const { languageSelect = null } = options;
    currentLanguage = resolveInitialLanguage();
    setLanguage(currentLanguage, { persist: false, notify: false });
    setupLanguageSelect(languageSelect);
    return {
        getLanguage,
        setLanguage,
        t,
        onLanguageChange,
        applyTranslations
    };
}
