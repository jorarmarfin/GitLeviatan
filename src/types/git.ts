import type { ThemePreference } from "@/types/theme";

// Espejo de las structs Rust (serde, camelCase). Mantener sincronizado con src-tauri/src/git/types.rs.

export type RepositoryRef = { id: string; path: string; name: string };

export type ChangeKind =
  "added" | "modified" | "deleted" | "renamed" | "copied" | "typechange" | "conflicted";

export type ChangedFile = { path: string; origPath: string | null; kind: ChangeKind };

export type RepositoryStatus = {
  branch: string | null;
  detachedHead: boolean;
  staged: ChangedFile[];
  unstaged: ChangedFile[];
  untracked: string[];
};

export type CommitNode = {
  oid: string;
  shortOid: string;
  parents: string[];
  author: string;
  authoredAt: string; // ISO 8601
  subject: string;
  refs: string[];
};

export type CommitPage = { commits: CommitNode[]; nextCursor: string | null };

export type RecentRepository = { path: string; name: string; lastOpenedAt: string };

export type GitErrorPayload = { kind: string; message: string; detail: string | null };

export type DiffScope = "staged" | "unstaged";

export type FileDiff = {
  path: string;
  original: string;
  modified: string;
  isBinary: boolean;
  tooLarge: boolean; // > 1 MiB: no se envía contenido
};

export type CommitResult = { oid: string; shortOid: string };

/** Error de una operación que modifica el repositorio, con el stderr de Git si lo hay. */
export type OperationError = { message: string; detail: string | null };

export type RemoteInfo = { name: string; fetchUrl: string; pushUrl: string };

export type SyncPhase = "counting" | "receiving" | "resolving" | "sending" | "done";

export type SyncProgress = { operationId: string; phase: SyncPhase; percent: number | null };

export type SyncErrorKind =
  | "auth"
  | "network"
  | "nonFastForward"
  | "conflict"
  | "permission"
  | "remoteNotFound"
  | "cancelled"
  | "unknown";

/** Fallo de fetch/pull/push/clone, ya clasificado por el backend. */
export type SyncFailure = { kind: SyncErrorKind; message: string; detail: string | null };

/** Espejo de `storage/settings.rs`. */
export type Settings = {
  version: 1;
  theme: ThemePreference;
  gitPath: string | null; // null = buscar en el PATH
  maxRecentRepositories: number; // 5–50
};

export type GitInfo = { available: boolean; version: string | null; message: string | null };
