// Espejo de src-tauri/src/git/types.rs (serde, camelCase).

export type TagInfo = {
  name: string; // "v1.2.0"
  kind: "lightweight" | "annotated";
  targetOid: string; // commit al que apunta (pelado)
  tagOid: string | null; // objeto tag; null si es ligero
  message: string | null; // solo anotados
  taggerDate: string | null; // ISO 8601; en ligeros, fecha del commit
  existsLocal: boolean;
  existsRemote: boolean | null; // null si no se ha consultado el remoto
};

export type RemoteTag = { name: string; targetOid: string };

export type ReleaseCommit = { oid: string; subject: string };

export type ReleaseSuggestion = {
  lastTag: string | null;
  patch: string | null;
  minor: string | null;
  major: string | null;
  commitsSinceLastTag: ReleaseCommit[];
  behindUpstream: number;
};
