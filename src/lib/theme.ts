import type { ThemePreference } from "@/types/theme";

export const THEME_STORAGE_KEY = "gitleviatan:theme:v1";

const VALID: readonly ThemePreference[] = ["light", "dark", "system"];

export function getStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value && (VALID as readonly string[]).includes(value)) {
      return value as ThemePreference;
    }
  } catch {
    // localStorage no disponible: cae a "system".
  }
  return "system";
}

export function storeTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sin persistencia; la UI sigue funcionando.
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: ThemePreference): void {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}
