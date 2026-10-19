import { useEffect } from "react";

import { applyTheme } from "@/lib/theme";
import type { ThemePreference } from "@/types/theme";

/** Aplica el tema al documento y, en modo «system», sigue los cambios del sistema. */
export function useApplyTheme(theme: ThemePreference): void {
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);
}
