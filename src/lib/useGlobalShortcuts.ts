import { useEffect } from "react";

/** Zonas a las que se salta con Alt+1…3 (atributo `data-area` en el DOM). */
export const AREAS = { Digit1: "sidebar", Digit2: "graph", Digit3: "changes" } as const;

const FOCUSABLE =
  'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

export function focusArea(name: string): boolean {
  const area = document.querySelector<HTMLElement>(`[data-area="${name}"]`);
  if (!area) return false;
  const target = area.matches(FOCUSABLE) ? area : area.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
  return target !== null;
}

type Handlers = { onPreferences: () => void };

/**
 * Atajos globales (ver docs/shortcuts.md): Alt+1/2/3 saltan entre ramas, historial y cambios;
 * Ctrl+, (⌘+, en macOS) abre las preferencias. Se ignoran con un diálogo abierto.
 */
export function useGlobalShortcuts({ onPreferences }: Handlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === ",") {
        event.preventDefault();
        onPreferences();
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code in AREAS) {
        const name = AREAS[event.code as keyof typeof AREAS];
        if (focusArea(name)) event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onPreferences]);
}
