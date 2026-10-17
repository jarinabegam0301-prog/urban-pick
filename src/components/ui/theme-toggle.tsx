"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "urban-theme";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("urban-theme", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("urban-theme", onStoreChange);
  };
}

function currentTheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event("urban-theme"));
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M18 6l-1.3 1.3M7.3 16.7 6 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
