/**
 * MINT TYPING — NAVIGATION & THEME CONTROLLER
 * Manages responsive drawer, multi-theme switching (Light, Dark, Mint), and sound settings.
 */

(function () {
    "use strict";

    const THEMES = ["light", "dark", "mint"];
    const THEME_LABELS = {
        light: "Light",
        dark: "Dark",
        mint: "Mint"
    };
    const THEME_STORAGE_KEY = "mint_typing_theme";
    const SOUND_STORAGE_KEY = "mint_typing_sound";

    // --------------------------------------------------------------------------
    // THEME CONTROLLER
    // --------------------------------------------------------------------------
    function getStoredTheme() {
        try {
            const saved = localStorage.getItem(THEME_STORAGE_KEY);
            if (saved && THEMES.includes(saved)) {
                return saved;
            }
        } catch {
            // Storage unavailable
        }
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            return "dark";
        }
        return "light";
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // Storage unavailable
        }

        const themeBtns = document.querySelectorAll("[data-theme-toggle]");
        themeBtns.forEach((btn) => {
            const labelEl = btn.querySelector(".theme-label");
            if (labelEl) {
                labelEl.textContent = THEME_LABELS[theme] || theme;
            }
            btn.setAttribute("aria-label", `Current theme: ${THEME_LABELS[theme]}. Click to switch.`);
        });

        // Notify other systems (e.g. canvas or charts if needed)
        window.dispatchEvent(new CustomEvent("mintthemechange", { detail: { theme } }));
    }

    function cycleTheme() {
        const current = document.documentElement.getAttribute("data-theme") || "light";
        const currentIndex = THEMES.indexOf(current);
        const nextIndex = (currentIndex + 1) % THEMES.length;
        applyTheme(THEMES[nextIndex]);
    }

    // Apply immediately to prevent theme flash
    applyTheme(getStoredTheme());

    // --------------------------------------------------------------------------
    // SOUND CONTROLLER
    // --------------------------------------------------------------------------
    function getStoredSound() {
        try {
            return localStorage.getItem(SOUND_STORAGE_KEY) === "on";
        } catch {
            return false;
        }
    }

    function applySound(enabled) {
        try {
            localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "on" : "off");
        } catch {
            // Storage unavailable
        }

        const soundBtns = document.querySelectorAll("[data-sound-toggle]");
        soundBtns.forEach((btn) => {
            btn.classList.toggle("active", enabled);
            const labelEl = btn.querySelector(".sound-label");
            if (labelEl) {
                labelEl.textContent = enabled ? "Sound On" : "Muted";
            }
            btn.setAttribute("aria-pressed", String(enabled));
        });

        window.dispatchEvent(new CustomEvent("mintsoundschanged", { detail: { enabled } }));
    }

    function toggleSound() {
        applySound(!getStoredSound());
    }

    // --------------------------------------------------------------------------
    // DOM READY INITIALIZATION
    // --------------------------------------------------------------------------
    document.addEventListener("DOMContentLoaded", () => {
        // Theme toggle buttons
        document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
            btn.addEventListener("click", cycleTheme);
        });

        // Sound toggle buttons
        document.querySelectorAll("[data-sound-toggle]").forEach((btn) => {
            btn.addEventListener("click", toggleSound);
        });
        applySound(getStoredSound());

        // Mobile Nav
        const toggle = document.querySelector(".nav-toggle");
        const nav = document.querySelector(".site-nav");
        const header = document.querySelector(".site-header");

        if (!toggle || !nav || !header) {
            return;
        }

        function closeNav() {
            document.body.classList.remove("nav-open");
            toggle.setAttribute("aria-expanded", "false");
        }

        function openNav() {
            document.body.classList.add("nav-open");
            toggle.setAttribute("aria-expanded", "true");
        }

        toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            if (document.body.classList.contains("nav-open")) {
                closeNav();
            } else {
                openNav();
            }
        });

        nav.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", closeNav);
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > 900) {
                closeNav();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
                closeNav();
                toggle.focus();
            }
        });

        document.addEventListener("click", (event) => {
            if (!document.body.classList.contains("nav-open")) {
                return;
            }
            if (!header.contains(event.target)) {
                closeNav();
            }
        });
    });
})();
