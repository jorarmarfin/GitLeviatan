use std::ffi::OsStr;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

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
    run(dir, args, None)
}

/// Igual que `run_git`, pero escribe `input` en la entrada estándar de Git.
pub fn run_git_with_input<I, S>(dir: &Path, args: I, input: &[u8]) -> Result<GitOutput, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run(dir, args, Some(input))
}

fn run<I, S>(dir: &Path, args: I, input: Option<&[u8]>) -> Result<GitOutput, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    if !dir.is_dir() {
        return Err(GitError::not_found(dir));
    }

    let to_error = |error: std::io::Error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            GitError::git_missing()
        } else {
            GitError::io(error)
        }
    };

    let mut command = Command::new("git");
    command
        .arg("--literal-pathspecs")
        .args(args)
        .current_dir(dir)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(to_error)?;
    if let (Some(bytes), Some(mut stdin)) = (input, child.stdin.take()) {
        // Un EPIPE (Git terminó antes de leer todo) se resuelve con el código de salida.
        let _ = stdin.write_all(bytes);
    }
    let output = child.wait_with_output().map_err(GitError::io)?;

    if output.status.success() {
        Ok(GitOutput {
            stdout: output.stdout,
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        // Algunos errores (p. ej. "nothing to commit") salen por stdout.
        let message = if stderr.trim().is_empty() {
            String::from_utf8_lossy(&output.stdout).into_owned()
        } else {
            stderr
        };
        Err(GitError::command(message))
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
    fn passes_input_to_stdin() {
        let out = run_git_with_input(&std::env::temp_dir(), ["hash-object", "--stdin"], b"hola\n")
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim().len(), 40);
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
