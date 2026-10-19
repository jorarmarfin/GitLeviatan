//! Errores de red/sincronización y su clasificación a partir del stderr de Git.

use serde::Serialize;

use super::error::GitError;
use super::remotes::sanitize_text;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncErrorKind {
    Auth,
    Network,
    NonFastForward,
    Conflict,
    Permission,
    RemoteNotFound,
    Cancelled,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncError {
    pub kind: SyncErrorKind,
    pub message: String,
    pub detail: String,
}

impl SyncError {
    pub fn cancelled() -> Self {
        Self {
            kind: SyncErrorKind::Cancelled,
            message: "Operación cancelada.".into(),
            detail: String::new(),
        }
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self {
            kind: SyncErrorKind::Unknown,
            message: message.into(),
            detail: String::new(),
        }
    }

    /// Clasifica el stderr de Git (generado con `LC_ALL=C`). El detalle que se devuelve
    /// ya está saneado: nunca contiene credenciales incrustadas en URLs.
    pub fn from_stderr(stderr: &str) -> Self {
        let kind = classify(stderr);
        let detail = sanitize_text(stderr.trim());
        let message = match kind {
            SyncErrorKind::Auth if has(stderr, &["host key verification failed"]) => {
                "No se pudo verificar la huella del servidor SSH. Conéctate una vez desde una terminal (ssh usuario@servidor) para aceptarla."
            }
            SyncErrorKind::Auth => {
                "Falló la autenticación. Revisa tu clave SSH (ssh-agent) o el credential helper de Git; la app no pide contraseñas."
            }
            SyncErrorKind::Network => "Sin conexión con el remoto. Revisa tu red e inténtalo de nuevo.",
            SyncErrorKind::NonFastForward => {
                "El remoto tiene cambios que no tienes en local. Haz pull (o fetch) e inténtalo de nuevo; no se modificó nada."
            }
            SyncErrorKind::Conflict => {
                "Hay cambios locales o conflictos que impiden la operación. No se modificó nada."
            }
            SyncErrorKind::Permission => "No tienes permiso para realizar esta operación en el remoto.",
            SyncErrorKind::RemoteNotFound => "El remoto o el repositorio no existe o no es accesible.",
            SyncErrorKind::Cancelled => "Operación cancelada.",
            SyncErrorKind::Unknown => "Git terminó con un error.",
        }
        .to_string();
        Self {
            kind,
            message,
            detail,
        }
    }
}

impl From<GitError> for SyncError {
    fn from(error: GitError) -> Self {
        Self {
            kind: SyncErrorKind::Unknown,
            message: sanitize_text(&error.message),
            detail: error.detail.map(|d| sanitize_text(&d)).unwrap_or_default(),
        }
    }
}

fn has(text: &str, needles: &[&str]) -> bool {
    let lower = text.to_ascii_lowercase();
    needles.iter().any(|n| lower.contains(n))
}

pub fn classify(stderr: &str) -> SyncErrorKind {
    // El orden importa: "Permission denied (publickey)" es autenticación, no permisos.
    if has(
        stderr,
        &[
            "authentication failed",
            "permission denied (publickey",
            "permission denied, please try again",
            "could not read username",
            "could not read password",
            "terminal prompts disabled",
            "host key verification failed",
            "invalid username or password",
            "returned error: 401",
        ],
    ) {
        SyncErrorKind::Auth
    } else if has(
        stderr,
        &[
            "non-fast-forward",
            "not possible to fast-forward",
            "updates were rejected",
            "failed to push some refs",
            "(fetch first)",
            "divergent branches",
        ],
    ) {
        SyncErrorKind::NonFastForward
    } else if has(
        stderr,
        &[
            "conflict",
            "automatic merge failed",
            "would be overwritten by merge",
            "would be overwritten by checkout",
            "unmerged files",
        ],
    ) {
        SyncErrorKind::Conflict
    } else if has(
        stderr,
        &[
            "returned error: 403",
            "permission to",
            "permission denied",
            "access denied",
            "hook declined",
            "protected branch",
        ],
    ) {
        SyncErrorKind::Permission
    } else if has(
        stderr,
        &[
            "repository not found",
            "does not appear to be a git repository",
            "returned error: 404",
            "no such remote",
            "does not exist",
        ],
    ) {
        SyncErrorKind::RemoteNotFound
    } else if has(
        stderr,
        &[
            "could not resolve host",
            "could not resolve hostname",
            "connection timed out",
            "connection refused",
            "connection reset",
            "network is unreachable",
            "failed to connect",
            "operation timed out",
            "unable to access",
            "temporary failure in name resolution",
            "no route to host",
            "the remote end hung up unexpectedly",
        ],
    ) {
        SyncErrorKind::Network
    } else {
        SyncErrorKind::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(stderr: &str) -> SyncErrorKind {
        classify(stderr)
    }

    #[test]
    fn classifies_auth_failures() {
        assert_eq!(
            kind("git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository."),
            SyncErrorKind::Auth
        );
        assert_eq!(
            kind("fatal: could not read Username for 'https://github.com': terminal prompts disabled"),
            SyncErrorKind::Auth
        );
        assert_eq!(
            kind("remote: Invalid username or password.\nfatal: Authentication failed for 'https://x/'"),
            SyncErrorKind::Auth
        );
        assert_eq!(kind("Host key verification failed."), SyncErrorKind::Auth);
    }

    #[test]
    fn host_key_has_specific_message() {
        let e = SyncError::from_stderr(
            "Host key verification failed.\nfatal: Could not read from remote repository.",
        );
        assert_eq!(e.kind, SyncErrorKind::Auth);
        assert!(e.message.contains("huella"));
    }

    #[test]
    fn classifies_network_failures() {
        assert_eq!(
            kind("fatal: unable to access 'https://github.com/o/r.git/': Could not resolve host: github.com"),
            SyncErrorKind::Network
        );
        assert_eq!(
            kind("ssh: connect to host h port 22: Connection timed out\nfatal: Could not read from remote repository."),
            SyncErrorKind::Network
        );
        assert_eq!(
            kind("ssh: Could not resolve hostname nohost: Temporary failure in name resolution"),
            SyncErrorKind::Network
        );
    }

    #[test]
    fn classifies_non_fast_forward() {
        let push = " ! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs to '/tmp/r'\nhint: Updates were rejected because the tip of your current branch is behind";
        assert_eq!(kind(push), SyncErrorKind::NonFastForward);
        assert_eq!(
            kind("fatal: Not possible to fast-forward, aborting."),
            SyncErrorKind::NonFastForward
        );
        assert_eq!(
            kind(" ! [rejected] main -> main (fetch first)"),
            SyncErrorKind::NonFastForward
        );
    }

    #[test]
    fn classifies_conflicts() {
        assert_eq!(
            kind("error: Your local changes to the following files would be overwritten by merge:\n\ta.txt"),
            SyncErrorKind::Conflict
        );
        assert_eq!(
            kind("CONFLICT (content): Merge conflict in a.txt"),
            SyncErrorKind::Conflict
        );
    }

    #[test]
    fn classifies_permission() {
        assert_eq!(
            kind("remote: Permission to o/r.git denied to user.\nfatal: unable to access 'https://github.com/o/r.git/': The requested URL returned error: 403"),
            SyncErrorKind::Permission
        );
        assert_eq!(
            kind("remote: error: GH006: Protected branch update failed"),
            SyncErrorKind::Permission
        );
    }

    #[test]
    fn classifies_remote_not_found() {
        assert_eq!(
            kind("fatal: '/no/existe' does not appear to be a git repository\nfatal: Could not read from remote repository."),
            SyncErrorKind::RemoteNotFound
        );
        assert_eq!(
            kind("remote: Repository not found.\nfatal: repository 'https://x/y.git/' not found"),
            SyncErrorKind::RemoteNotFound
        );
        assert_eq!(
            kind("fatal: No such remote: 'foo'"),
            SyncErrorKind::RemoteNotFound
        );
    }

    #[test]
    fn falls_back_to_unknown_with_raw_detail() {
        let e = SyncError::from_stderr("algo raro que Git nunca dijo antes");
        assert_eq!(e.kind, SyncErrorKind::Unknown);
        assert_eq!(e.detail, "algo raro que Git nunca dijo antes");
    }

    #[test]
    fn detail_never_contains_credentials() {
        let e = SyncError::from_stderr("fatal: unable to access 'https://u:secreto@h.com/r.git/': Could not resolve host: h.com");
        assert_eq!(e.kind, SyncErrorKind::Network);
        assert!(!e.detail.contains("secreto"));
        assert!(!e.message.contains("secreto"));
    }
}
