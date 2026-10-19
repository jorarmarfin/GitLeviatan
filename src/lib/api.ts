import { invoke } from "@tauri-apps/api/core";

import type {
  CommitPage,
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

export const api = {
  openRepository: (path: string) => invoke<RepositoryRef>("open_repository", { path }),
  listRecentRepositories: () => invoke<RecentRepository[]>("list_recent_repositories"),
  getStatus: (repositoryId: string) => invoke<RepositoryStatus>("get_status", { repositoryId }),
  listCommits: (repositoryId: string, cursor: string | null, limit: number) =>
    invoke<CommitPage>("list_commits", { repositoryId, cursor, limit }),
};
