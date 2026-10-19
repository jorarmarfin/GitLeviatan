import type { ChangeKind } from "@/types/git";

/** Tipo que se muestra en la lista: los de Git más «untracked» (archivo nuevo sin seguimiento). */
export type ChangeTone = ChangeKind | "untracked";

/** Color del texto de cada tipo de cambio. Solo tokens de `index.css`, nunca colores sueltos. */
export const CHANGE_TEXT: Record<ChangeTone, string> = {
  added: "text-change-added",
  modified: "text-change-modified",
  deleted: "text-change-deleted",
  renamed: "text-change-renamed",
  copied: "text-change-renamed",
  typechange: "text-change-renamed",
  conflicted: "text-destructive",
  untracked: "text-change-untracked",
};

/** Marca de color de las cabeceras de sección. */
export const SECTION_DOT = {
  staged: "bg-change-added",
  unstaged: "bg-change-modified",
  untracked: "bg-change-untracked",
} as const;
