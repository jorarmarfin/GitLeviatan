import type { ThemePreference } from "@/types/theme";

/** Clave antigua (SPEC 01). Solo se lee para migrar el tema a `settings.json`. */
export const LEGACY_THEME_KEY = "gitleviatan:theme:v1";

const VALID: readonly ThemePreference[] = ["light", "dark", "system"];

export function readLegacyTheme(): ThemePreference | null {
  try {
    const value = localStorage.getItem(LEGACY_THEME_KEY);
    if (value && (VALID as readonly string[]).includes(value)) {
      return value as ThemePreference;
    }
  } catch {
    // localStorage no disponible: nada que migrar.
  }
  return null;
}

export function clearLegacyTheme(): void {
  try {
    localStorage.removeItem(LEGACY_THEME_KEY);
  } catch {
    // Sin acceso: la migración se reintentaría, pero es idempotente.
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: ThemePreference): void {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}
