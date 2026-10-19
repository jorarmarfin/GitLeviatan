import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type ContextMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Razón por la que está deshabilitado; se muestra como `title`. */
  hint?: string;
  destructive?: boolean;
};

type Props = {
  /** Posición del puntero (coordenadas de la ventana). */
  x: number;
  y: number;
  label: string;
  items: ContextMenuItem[];
  onClose: () => void;
};

const WIDTH = 256;
const ITEM_HEIGHT = 32;

/**
 * Menú contextual accesible (`role="menu"`): flechas para moverse, Enter para elegir y Esc para
 * cerrar. Se cierra al hacer clic fuera, al desplazar o al cambiar el tamaño de la ventana.
 */
export function ContextMenu({ x, y, label, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const menu = menuRef.current;
    const enabled = () =>
      Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    enabled()[0]?.focus();

    const close = () => onCloseRef.current();
    const onPointerDown = (event: Event) => {
      if (!menu?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("contextmenu", onPointerDown);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("contextmenu", onPointerDown);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    const index = enabled.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
      case "ArrowDown":
        event.preventDefault();
        enabled[(index + 1) % enabled.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        enabled[(index - 1 + enabled.length) % enabled.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        enabled[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        enabled[enabled.length - 1]?.focus();
        break;
      case "Tab":
        event.preventDefault();
        onClose();
        break;
    }
  }

  const left = Math.max(4, Math.min(x, window.innerWidth - WIDTH - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - items.length * ITEM_HEIGHT - 16));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ left, top, width: WIDTH }}
      className="fixed z-50 flex flex-col rounded-md border border-border bg-card p-1 text-sm text-card-foreground shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          title={item.disabled ? item.hint : undefined}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cn(
            "h-8 truncate rounded px-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
            item.destructive && "text-destructive",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
