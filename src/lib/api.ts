import { invoke } from "@tauri-apps/api/core";

import type { CommitDetail } from "@/features/graph/types";
import type {
  CommitPage,
  CommitResult,
  DiffScope,
  FileDiff,
  GitErrorPayload,
  RecentRepository,
  RepositoryRef,
  RepositoryStatus,
} from "@/types/git";

/** Convierte lo que lance `invoke` (error serializado de Rust o cualquier cosa) en texto. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as GitErrorPayload).message);
  }
  return "Error desconocido";
}

/** Detalle técnico (stderr de Git o de un hook) cuando el error lo trae. */
export function errorDetail(error: unknown): string | null {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as GitErrorPayload).detail;
    return typeof detail === "string" && detail.trim() !== "" ? detail : null;
  }
  return null;
}

export const api = {
  openRepository: (path: string) => invoke<RepositoryRef>("open_repository", { path }),
  listRecentRepositories: () => invoke<RecentRepository[]>("list_recent_repositories"),
  getStatus: (repositoryId: string) => invoke<RepositoryStatus>("get_status", { repositoryId }),
  getCommit: (repositoryId: string, oid: string) =>
    invoke<CommitDetail>("get_commit", { repositoryId, oid }),
  stageFiles: (repositoryId: string, paths: string[]) =>
    invoke<void>("stage_files", { repositoryId, paths }),
  unstageFiles: (repositoryId: string, paths: string[]) =>
    invoke<void>("unstage_files", { repositoryId, paths }),
  getDiff: (repositoryId: string, path: string, scope: DiffScope) =>
    invoke<FileDiff>("get_diff", { repositoryId, path, scope }),
  createCommit: (repositoryId: string, message: string) =>
    invoke<CommitResult>("create_commit", { repositoryId, message }),
  listCommits: (repositoryId: string, cursor: string | null, limit: number) =>
    invoke<CommitPage>("list_commits", { repositoryId, cursor, limit }),
};
