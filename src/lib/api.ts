import { invoke } from "@tauri-apps/api/core";

import type { BranchInfo, DeleteBranchOutcome } from "@/features/branches/types";
import type { CommitDetail } from "@/features/graph/types";
import type {
  CommitPage,
  CommitResult,
  DiffScope,
  FileDiff,
  AppError,
  AppErrorKind,
  GitInfo,
  RecentRepository,
  RemoteInfo,
  RepositoryRef,
  RepositoryStatus,
  Settings,
} from "@/types/git";

/** Convierte lo que lance `invoke` (error serializado de Rust o cualquier cosa) en texto. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as AppError).message);
  }
  return "Error desconocido";
}

/** Detalle técnico (stderr de Git o de un hook) cuando el error lo trae. */
export function errorDetail(error: unknown): string | null {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as AppError).detail;
    return typeof detail === "string" && detail.trim() !== "" ? detail : null;
  }
  return null;
}

const APP_ERROR_KINDS: readonly AppErrorKind[] = [
  "git",
  "auth",
  "network",
  "validation",
  "io",
  "notFound",
  "cancelled",
  "internal",
];

/** Normaliza lo que lance `invoke` (un `AppError` o cualquier otra cosa) a un `AppError`. */
export function toAppError(error: unknown): AppError {
  const kind =
    error && typeof error === "object" && "kind" in error
      ? APP_ERROR_KINDS.find((k) => k === (error as AppError).kind)
      : undefined;
  return { kind: kind ?? "internal", message: errorMessage(error), detail: errorDetail(error) };
}

export const api = {
  openRepository: (path: string) => invoke<RepositoryRef>("open_repository", { path }),
  listRecentRepositories: () => invoke<RecentRepository[]>("list_recent_repositories"),
  clearRecentRepositories: () => invoke<void>("clear_recent_repositories"),
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (newSettings: Settings) => invoke<Settings>("update_settings", { newSettings }),
  detectGit: () => invoke<GitInfo>("detect_git"),
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
  listBranches: (repositoryId: string) => invoke<BranchInfo[]>("list_branches", { repositoryId }),
  createBranch: (repositoryId: string, name: string, startPoint: string | null) =>
    invoke<void>("create_branch", { repositoryId, name, startPoint }),
  checkoutBranch: (repositoryId: string, branch: string) =>
    invoke<void>("checkout_branch", { repositoryId, branch }),
  deleteBranch: (repositoryId: string, branch: string, force: boolean) =>
    invoke<DeleteBranchOutcome>("delete_branch", { repositoryId, branch, force }),
  listRemotes: (repositoryId: string) => invoke<RemoteInfo[]>("list_remotes", { repositoryId }),
  fetch: (repositoryId: string, remote: string) => invoke<void>("fetch", { repositoryId, remote }),
  pull: (repositoryId: string, remote: string, branch: string) =>
    invoke<void>("pull", { repositoryId, remote, branch }),
  push: (repositoryId: string, remote: string, branch: string) =>
    invoke<void>("push", { repositoryId, remote, branch }),
  cloneRepository: (url: string, destDir: string) =>
    invoke<RepositoryRef>("clone_repository", { url, destDir }),
  cancelOperation: (operationId: string) => invoke<boolean>("cancel_operation", { operationId }),
  listCommits: (repositoryId: string, cursor: string | null, limit: number) =>
    invoke<CommitPage>("list_commits", { repositoryId, cursor, limit }),
};
