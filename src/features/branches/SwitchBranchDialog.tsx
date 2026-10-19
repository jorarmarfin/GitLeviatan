import { useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { OperationError } from "@/types/git";

import type { BranchInfo } from "./types";

type Props = {
  branches: BranchInfo[];
  busy: boolean;
  error: OperationError | null;
  onSelect: (branch: BranchInfo) => void;
  onClose: () => void;
};

/** Ramas cuyo nombre contiene el texto (sin distinguir mayúsculas); locales primero. */
export function filterBranches(branches: BranchInfo[], query: string): BranchInfo[] {
  const needle = query.trim().toLowerCase();
  return branches
    .filter((b) => needle === "" || b.name.toLowerCase().includes(needle))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "local" ? -1 : 1));
}

/**
 * Selector de rama: un cuadro de búsqueda (combobox) sobre la lista de ramas locales y remotas.
 * Flechas para moverse, Enter para cambiar, Esc para cerrar.
 */
export function SwitchBranchDialog({ branches, busy, error, onSelect, onClose }: Props) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const matches = useMemo(() => filterBranches(branches, query), [branches, query]);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const optionId = (index: number) => `${listId}-${index}`;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (matches.length === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive(Math.min(matches.length - 1, activeIndex + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(Math.max(0, activeIndex - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(matches.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        if (!busy) onSelect(matches[activeIndex]);
        break;
    }
  }

  return (
    <Modal title="Cambiar de rama" onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <input
          autoFocus
          role="combobox"
          aria-label="Buscar rama"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={matches.length > 0 ? optionId(activeIndex) : undefined}
          placeholder="Buscar rama…"
          value={query}
          disabled={busy}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
          className="rounded-md border border-input bg-background px-2 py-1.5"
        />

        <ul
          id={listId}
          role="listbox"
          aria-label="Ramas"
          className="max-h-64 overflow-y-auto rounded-md border border-border"
        >
          {matches.map((branch, index) => (
            <li
              key={`${branch.kind}:${branch.name}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActive(index)}
              onClick={() => !busy && onSelect(branch)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-2 py-1.5",
                index === activeIndex && "bg-selected",
              )}
            >
              <span aria-hidden="true" className="w-3 shrink-0 text-primary">
                {branch.isCurrent ? "●" : ""}
              </span>
              <span className="min-w-0 flex-1 truncate">{branch.name}</span>
              {branch.isCurrent && <span className="text-xs text-muted-foreground">actual</span>}
              {branch.kind === "remote" && (
                <span className="text-xs text-muted-foreground">remota</span>
              )}
            </li>
          ))}
        </ul>
        {matches.length === 0 && (
          <p className="text-muted-foreground">Ninguna rama coincide con «{query.trim()}».</p>
        )}
        <p className="text-xs text-muted-foreground">
          Las ramas remotas crean una rama local con seguimiento. Si tienes cambios sin confirmar
          que lo impidan, no se cambia de rama.
        </p>

        {error && <ErrorNotice error={error} title="No se pudo cambiar de rama" />}
      </div>
    </Modal>
  );
}
