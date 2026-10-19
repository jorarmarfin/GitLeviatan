use std::ffi::OsStr;
use std::path::Path;
use std::process::Command;

use super::error::GitError;

#[derive(Debug)]
pub struct GitOutput {
    pub stdout: Vec<u8>,
}

/// Ejecuta Git con argumentos estructurados (nunca por shell).
///
/// `LC_ALL=C` fija los mensajes en inglés para poder clasificar errores y
/// `GIT_TERMINAL_PROMPT=0` evita que Git espere entrada en una terminal inexistente.
pub fn run_git<I, S>(dir: &Path, args: I) -> Result<GitOutput, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    if !dir.is_dir() {
        return Err(GitError::not_found(dir));
    }

    let output = Command::new("git")
        .arg("--literal-pathspecs")
        .args(args)
        .current_dir(dir)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GitError::git_missing()
            } else {
                GitError::io(error)
            }
        })?;

    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if output.status.success() {
        Ok(GitOutput {
            stdout: output.stdout,
        })
    } else {
        Err(GitError::command(stderr))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_git_version() {
        let out = run_git(&std::env::temp_dir(), ["--version"]).unwrap();
        assert!(String::from_utf8_lossy(&out.stdout).starts_with("git version"));
    }

    #[test]
    fn rejects_missing_directory() {
        let err = run_git(Path::new("/no/existe/gitleviatan"), ["status"]).unwrap_err();
        assert_eq!(err.kind, super::super::error::GitErrorKind::NotFound);
    }

    #[test]
    fn reports_git_failure() {
        let err = run_git(&std::env::temp_dir(), ["no-such-subcommand"]).unwrap_err();
        assert_eq!(err.kind, super::super::error::GitErrorKind::Command);
    }
}
