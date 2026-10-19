//! Tipo de error único que cruza la frontera Tauri hacia el frontend.

use serde::Serialize;

use super::remotes::sanitize_text;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AppErrorKind {
    /// Git falló, no está disponible o la carpeta no es un repositorio utilizable.
    Git,
    /// Autenticación o permisos denegados.
    Auth,
    Network,
    /// Entrada del usuario no válida (nombres, rangos, rutas).
    Validation,
    Io,
    NotFound,
    Cancelled,
    Internal,
}

/// `message` es legible por personas; `detail` conserva el stderr saneado (sin credenciales).
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub kind: AppErrorKind,
    pub message: String,
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(kind: AppErrorKind, message: impl Into<String>, detail: Option<String>) -> Self {
        Self {
            kind,
            message: sanitize_text(&message.into()),
            detail: detail.map(|d| sanitize_text(&d)),
        }
    }

    pub fn git_missing() -> Self {
        Self::new(
            AppErrorKind::Git,
            "No se encontró el ejecutable de Git. Instálalo y vuelve a intentarlo.",
            None,
        )
    }

    pub fn not_found(path: &std::path::Path) -> Self {
        Self::new(
            AppErrorKind::NotFound,
            format!("La carpeta no existe: {}", path.display()),
            None,
        )
    }

    pub fn not_a_repository() -> Self {
        Self::new(
            AppErrorKind::Git,
            "La carpeta seleccionada no es un repositorio Git.",
            None,
        )
    }

    pub fn bare_repository() -> Self {
        Self::new(
            AppErrorKind::Validation,
            "Los repositorios bare no están soportados todavía.",
            None,
        )
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::Validation, message, None)
    }

    pub fn cancelled() -> Self {
        Self::new(AppErrorKind::Cancelled, "Operación cancelada.", None)
    }

    pub fn command(stderr: String) -> Self {
        let message = stderr
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Git terminó con un error.")
            .to_string();
        Self::new(AppErrorKind::Git, message, Some(stderr))
    }

    pub fn io(error: std::io::Error) -> Self {
        Self::new(AppErrorKind::Io, error.to_string(), None)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(AppErrorKind::Internal, message, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_with_camel_case_kind_and_null_detail() {
        let json = serde_json::to_value(AppError::not_found(std::path::Path::new("/x"))).unwrap();
        assert_eq!(json["kind"], "notFound");
        assert_eq!(json["message"], "La carpeta no existe: /x");
        assert!(json["detail"].is_null());
    }

    #[test]
    fn every_constructor_gives_a_readable_message_and_expected_kind() {
        let cases = [
            (AppError::git_missing(), AppErrorKind::Git),
            (AppError::not_a_repository(), AppErrorKind::Git),
            (AppError::bare_repository(), AppErrorKind::Validation),
            (AppError::invalid_input("mal"), AppErrorKind::Validation),
            (AppError::cancelled(), AppErrorKind::Cancelled),
            (AppError::command("fatal: algo".into()), AppErrorKind::Git),
            (
                AppError::io(std::io::Error::other("disco")),
                AppErrorKind::Io,
            ),
            (AppError::internal("bug"), AppErrorKind::Internal),
        ];
        for (error, kind) in cases {
            assert_eq!(error.kind, kind);
            assert!(!error.message.trim().is_empty());
        }
    }

    #[test]
    fn command_keeps_first_line_as_message_and_full_stderr_as_detail() {
        let error = AppError::command("\nfatal: primera\nhint: segunda\n".into());
        assert_eq!(error.message, "fatal: primera");
        assert_eq!(
            error.detail.as_deref(),
            Some("\nfatal: primera\nhint: segunda\n")
        );
    }

    #[test]
    fn command_without_output_has_generic_message() {
        assert_eq!(
            AppError::command(String::new()).message,
            "Git terminó con un error."
        );
    }

    #[test]
    fn message_and_detail_never_leak_credentials() {
        let error = AppError::command(
            "fatal: unable to access 'https://u:secreto@h.com/r.git/': error".into(),
        );
        assert!(!error.message.contains("secreto"));
        assert!(!error.detail.unwrap().contains("secreto"));
    }
}
