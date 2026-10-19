use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitErrorKind {
    GitMissing,
    NotFound,
    NotARepository,
    BareRepository,
    InvalidInput,
    Command,
    Io,
    Internal,
}

/// Error serializable que cruza la frontera Tauri hacia el frontend.
#[derive(Debug, Clone, Serialize)]
pub struct GitError {
    pub kind: GitErrorKind,
    pub message: String,
    pub detail: Option<String>,
}

impl GitError {
    fn new(kind: GitErrorKind, message: impl Into<String>, detail: Option<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            detail,
        }
    }

    pub fn git_missing() -> Self {
        Self::new(
            GitErrorKind::GitMissing,
            "No se encontró el ejecutable de Git. Instálalo y vuelve a intentarlo.",
            None,
        )
    }

    pub fn not_found(path: &std::path::Path) -> Self {
        Self::new(
            GitErrorKind::NotFound,
            format!("La carpeta no existe: {}", path.display()),
            None,
        )
    }

    pub fn not_a_repository() -> Self {
        Self::new(
            GitErrorKind::NotARepository,
            "La carpeta seleccionada no es un repositorio Git.",
            None,
        )
    }

    pub fn bare_repository() -> Self {
        Self::new(
            GitErrorKind::BareRepository,
            "Los repositorios bare no están soportados todavía.",
            None,
        )
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::InvalidInput, message, None)
    }

    pub fn command(stderr: String) -> Self {
        let message = stderr
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Git terminó con un error.")
            .to_string();
        Self::new(GitErrorKind::Command, message, Some(stderr))
    }

    pub fn io(error: std::io::Error) -> Self {
        Self::new(GitErrorKind::Io, error.to_string(), None)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(GitErrorKind::Internal, message, None)
    }
}
