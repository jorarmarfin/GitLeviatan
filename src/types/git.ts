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
