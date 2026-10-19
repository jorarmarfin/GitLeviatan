import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = { title: string; onClose: () => void; children: ReactNode };

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: Esc y clic fuera lo cierran, el foco entra al abrirse, queda
 * atrapado dentro (Tab y Mayús+Tab dan la vuelta) y vuelve a donde estaba al cerrarse.
 */
export function Modal({ title, onClose, children }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const items = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    // Un `autoFocus` del contenido ya habrá puesto el foco dentro.
    if (dialog && !dialog.contains(document.activeElement)) (items()[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = items();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg outline-none"
      >
        <h2 id={titleId} className="mb-3 text-base font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
