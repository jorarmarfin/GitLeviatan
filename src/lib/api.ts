import { invoke } from "@tauri-apps/api/core";

import type {
  BranchInfo,
  DeleteBranchOutcome,
  MergePreview,
  MergeResult,
} from "@/features/branches/types";
import type { CommitDetail } from "@/features/graph/types";
import type { ReleaseSuggestion, RemoteTag, TagInfo } from "@/features/tags/types";
import type {
  CommitFiles,
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
  removeRecentRepository: (path: string) => invoke<void>("remove_recent_repository", { path }),
  forgetLastRepository: () => invoke<void>("forget_last_repository"),
  getAppVersion: () => invoke<string>("get_app_version"),
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
  stageAll: (repositoryId: string) => invoke<void>("stage_all", { repositoryId }),
  unstageAll: (repositoryId: string) => invoke<void>("unstage_all", { repositoryId }),
  getDiff: (repositoryId: string, path: string, scope: DiffScope) =>
    invoke<FileDiff>("get_diff", { repositoryId, path, scope }),
  listCommitFiles: (repositoryId: string, oid: string) =>
    invoke<CommitFiles>("list_commit_files", { repositoryId, oid }),
  getCommitFileDiff: (repositoryId: string, oid: string, path: string, origPath: string | null) =>
    invoke<FileDiff>("get_commit_file_diff", { repositoryId, oid, path, origPath }),
  createCommit: (repositoryId: string, message: string) =>
    invoke<CommitResult>("create_commit", { repositoryId, message }),
  listBranches: (repositoryId: string) => invoke<BranchInfo[]>("list_branches", { repositoryId }),
  createBranch: (repositoryId: string, name: string, startPoint: string | null) =>
    invoke<void>("create_branch", { repositoryId, name, startPoint }),
  checkoutBranch: (repositoryId: string, branch: string) =>
    invoke<void>("checkout_branch", { repositoryId, branch }),
  mergePreview: (repositoryId: string, source: string) =>
    invoke<MergePreview>("merge_preview", { repositoryId, source }),
  mergeBranch: (repositoryId: string, source: string) =>
    invoke<MergeResult>("merge_branch", { repositoryId, source }),
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
  listTags: (repositoryId: string) => invoke<TagInfo[]>("list_tags", { repositoryId }),
  /** Oid del commit al que apunta una rama, tag u otra expresión; falla si no existe. */
  resolveRef: (repositoryId: string, expression: string) =>
    invoke<string>("resolve_ref", { repositoryId, expression }),
  /** Con `message` crea un tag anotado; sin él, uno ligero. `target` null es HEAD. */
  createTag: (repositoryId: string, name: string, target: string | null, message: string | null) =>
    invoke<void>("create_tag", { repositoryId, name, target, message }),
  deleteTag: (repositoryId: string, name: string) =>
    invoke<void>("delete_tag", { repositoryId, name }),
  releaseSuggestion: (repositoryId: string) =>
    invoke<ReleaseSuggestion>("release_suggestion", { repositoryId }),
  listRemoteTags: (repositoryId: string, remote: string) =>
    invoke<RemoteTag[]>("list_remote_tags", { repositoryId, remote }),
  fetchTags: (repositoryId: string, remote: string) =>
    invoke<void>("fetch_tags", { repositoryId, remote }),
  pushTag: (repositoryId: string, remote: string, name: string) =>
    invoke<void>("push_tag", { repositoryId, remote, name }),
  deleteRemoteTag: (repositoryId: string, remote: string, name: string) =>
    invoke<void>("delete_remote_tag", { repositoryId, remote, name }),
  listCommits: (repositoryId: string, cursor: string | null, limit: number) =>
    invoke<CommitPage>("list_commits", { repositoryId, cursor, limit }),
};
