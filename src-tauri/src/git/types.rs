use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRef {
    pub id: String,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Typechange,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub orig_path: Option<String>,
    pub kind: ChangeKind,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryStatus {
    pub branch: Option<String>,
    pub detached_head: bool,
    pub staged: Vec<ChangedFile>,
    pub unstaged: Vec<ChangedFile>,
    pub untracked: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitNode {
    pub oid: String,
    pub short_oid: String,
    pub parents: Vec<String>,
    pub author: String,
    pub authored_at: String,
    pub subject: String,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    #[serde(flatten)]
    pub commit: CommitNode,
    pub body: String,
    pub committer: String,
    pub committed_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitPage {
    pub commits: Vec<CommitNode>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepository {
    pub path: String,
    pub name: String,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiffScope {
    Staged,
    Unstaged,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub original: String,
    pub modified: String,
    pub is_binary: bool,
    pub too_large: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub oid: String,
    pub short_oid: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BranchKind {
    Local,
    Remote,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub kind: BranchKind,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub tip_oid: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DeleteReason {
    NotMerged,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum DeleteBranchOutcome {
    Deleted,
    NeedsForce { reason: DeleteReason },
}

/// Por qué no se puede fusionar ahora mismo.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum MergeBlock {
    DetachedHead,
    LocalChanges { files: Vec<String> },
}

/// Qué pasaría al fusionar `source` en la rama actual (`target`).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MergePreview {
    pub source: String,
    pub target: String,
    pub commits_to_merge: u32,
    pub up_to_date: bool,
    pub fast_forward: bool,
    pub blocked: Option<MergeBlock>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum MergeResult {
    UpToDate,
    FastForward {
        oid: String,
    },
    Merged {
        oid: String,
    },
    /// La fusión se canceló sola: el repositorio quedó como estaba.
    Conflict {
        files: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    /// URLs sin credenciales incrustadas.
    pub fetch_url: String,
    pub push_url: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncPhase {
    Counting,
    Receiving,
    Resolving,
    Sending,
    Done,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub operation_id: String,
    pub phase: SyncPhase,
    pub percent: Option<u8>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TagKind {
    Lightweight,
    Annotated,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub kind: TagKind,
    /// Commit al que apunta (pelado).
    pub target_oid: String,
    /// Objeto tag; `None` si es ligero.
    pub tag_oid: Option<String>,
    /// Solo anotados.
    pub message: Option<String>,
    /// ISO 8601; en los ligeros, la fecha del commit.
    pub tagger_date: Option<String>,
    pub exists_local: bool,
    /// `None` si no se ha consultado el remoto.
    pub exists_remote: Option<bool>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTag {
    pub name: String,
    pub target_oid: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseCommit {
    pub oid: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseSuggestion {
    pub last_tag: Option<String>,
    pub patch: Option<String>,
    pub minor: Option<String>,
    pub major: Option<String>,
    pub commits_since_last_tag: Vec<ReleaseCommit>,
    pub behind_upstream: u32,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CommitFileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Typechange,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    /// Solo renombrados y copiados.
    pub orig_path: Option<String>,
    pub status: CommitFileStatus,
    /// `None` en binarios.
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
    pub is_binary: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitFiles {
    pub oid: String,
    /// Primer padre; `None` en el commit raíz.
    pub compared_with: Option<String>,
    pub is_merge: bool,
    /// Total real, aunque `files` esté recortado.
    pub total_files: usize,
    pub truncated: bool,
    pub files: Vec<CommitFile>,
}
