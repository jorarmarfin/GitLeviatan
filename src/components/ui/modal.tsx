import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = { title: string; onClose: () => void; children: ReactNode };

/** Diálogo modal accesible: Esc y clic fuera lo cierran, y devuelve el foco al cerrarse. */
export function Modal({ title, onClose, children }: Props) {
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
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
