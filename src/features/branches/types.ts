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

export type DeleteBranchOutcome =
  { status: "deleted" } | { status: "needsForce"; reason: "notMerged" };
