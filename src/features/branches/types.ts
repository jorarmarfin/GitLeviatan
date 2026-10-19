// Espejo de src-tauri/src/git/types.rs (serde, camelCase).

export type BranchInfo = {
  name: string; // "main" o "origin/main"
  kind: "local" | "remote";
  isCurrent: boolean;
  upstream: string | null; // solo ramas locales
  ahead: number;
  behind: number;
  tipOid: string;
};

/** Por qué no se puede fusionar ahora mismo (espejo de `MergeBlock` en Rust). */
export type MergeBlock = { reason: "detachedHead" } | { reason: "localChanges"; files: string[] };

/** Qué pasaría al fusionar `source` en la rama actual `target`. */
export type MergePreview = {
  source: string; // rama a fusionar ("feature" o "origin/main")
  target: string; // rama actual
  commitsToMerge: number; // commits de `source` que no están en `target`
  upToDate: boolean; // no hay nada que fusionar
  fastForward: boolean; // basta con avanzar `target`, sin commit de fusión
  blocked: MergeBlock | null;
};

export type MergeResult =
  | { status: "upToDate" }
  | { status: "fastForward"; oid: string }
  | { status: "merged"; oid: string }
  | { status: "conflict"; files: string[] }; // la fusión se canceló sola; nada cambió

export type DeleteBranchOutcome =
  { status: "deleted" } | { status: "needsForce"; reason: "notMerged" };
