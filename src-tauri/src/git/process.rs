use std::ffi::{OsStr, OsString};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, RwLock};

use super::error::GitError;

/// Ejecutable de Git elegido en las preferencias; `None` = buscar `git` en el `PATH`.
static GIT_PATH: RwLock<Option<PathBuf>> = RwLock::new(None);

/// Cambia el ejecutable de Git; afecta a las operaciones siguientes sin reiniciar.
pub fn set_git_path(path: Option<PathBuf>) {
    *GIT_PATH.write().expect("ruta de Git envenenada") = path;
}

fn git_program() -> OsString {
    match GIT_PATH.read().expect("ruta de Git envenenada").as_ref() {
        Some(path) => path.clone().into_os_string(),
        None => OsString::from("git"),
    }
}

fn git_command() -> Command {
    Command::new(git_program())
}

/// Busca un ejecutable por nombre en el `PATH` (apoyo de las pruebas).
#[cfg(test)]
pub fn find_in_path(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

/// Ejecuta `<git> --version` y devuelve la versión (`2.43.0`). Con `None` usa la ruta
/// configurada actualmente (o el `PATH`).
pub fn check_git(program: Option<&Path>) -> Result<String, GitError> {
    let mut command = match program {
        Some(path) => Command::new(path),
        None => git_command(),
    };
    let output = command
        .arg("--version")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => GitError::git_missing(),
            std::io::ErrorKind::PermissionDenied => {
                GitError::invalid_input("No se puede ejecutar el archivo seleccionado.")
            }
            _ => GitError::io(error),
        })?;
    let text = String::from_utf8_lossy(&output.stdout);
    match text.trim().strip_prefix("git version ") {
        Some(version) if output.status.success() => Ok(version.to_string()),
        _ => Err(GitError::invalid_input(
            "El archivo seleccionado no es un ejecutable de Git.",
        )),
    }
}

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

    let mut command = git_command();
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

/// Protocolos que Git puede usar en operaciones de red. Excluye `ext::` y similares,
/// que ejecutarían comandos arbitrarios a partir de una URL.
const ALLOWED_PROTOCOLS: &str = "file:git:http:https:ssh";

/// Máximo de stderr que se conserva para clasificar y mostrar como detalle.
const MAX_STDERR: usize = 64 * 1024;

/// Operación larga cancelable: guarda el proceso hijo para poder matarlo desde otro hilo.
#[derive(Default)]
pub struct Operation {
    cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl Operation {
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Marca la operación como cancelada y mata el proceso hijo si ya arrancó.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(child) = self.child.lock().expect("operación envenenada").as_mut() {
            kill_tree(child);
        }
    }
}

/// Mata a Git y a sus hijos (ssh, git-remote-https…): si no, siguen sujetando el pipe de
/// stderr y la lectura nunca termina. Git arranca en su propio grupo de procesos.
fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    {
        // SAFETY: `kill` solo envía una señal; el pid es el de un hijo propio que lidera su grupo.
        unsafe {
            libc::kill(-(child.id() as libc::pid_t), libc::SIGKILL);
        }
    }
    let _ = child.kill();
}

#[derive(Debug)]
pub struct StreamOutput {
    pub success: bool,
    pub cancelled: bool,
    pub stdout: Vec<u8>,
    /// Todo el stderr (hasta `MAX_STDERR`), incluidas las líneas de progreso.
    pub stderr: String,
}

/// Ejecuta Git leyendo stderr en vivo. `on_line` recibe cada línea; Git separa las de
/// progreso con `\r`, así que se corta en `\r` y `\n`. `operation.cancel()` mata el proceso.
pub fn run_git_streaming<I, S>(
    dir: &Path,
    args: I,
    operation: &Operation,
    mut on_line: impl FnMut(&str),
) -> Result<StreamOutput, GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    if !dir.is_dir() {
        return Err(GitError::not_found(dir));
    }

    let mut command = git_command();
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut command, 0);
    command
        .arg("--literal-pathspecs")
        .args(args)
        .current_dir(dir)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ALLOW_PROTOCOL", ALLOWED_PROTOCOLS)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            GitError::git_missing()
        } else {
            GitError::io(error)
        }
    })?;
    let mut stderr = child.stderr.take().expect("stderr es piped");
    let mut stdout = child.stdout.take().expect("stdout es piped");

    {
        let mut slot = operation.child.lock().expect("operación envenenada");
        // Cancelada antes de arrancar: no hay nada que esperar.
        if operation.is_cancelled() {
            kill_tree(&mut child);
        }
        *slot = Some(child);
    }

    // stdout se drena aparte para que Git no se bloquee con un pipe lleno.
    let stdout_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });

    let mut captured = String::new();
    let mut line = Vec::new();
    let mut chunk = [0u8; 4096];
    let mut flush = |line: &mut Vec<u8>, captured: &mut String| {
        if line.is_empty() {
            return;
        }
        let text = String::from_utf8_lossy(line).into_owned();
        line.clear();
        if captured.len() < MAX_STDERR {
            captured.push_str(&text);
            captured.push('\n');
        }
        on_line(&text);
    };
    loop {
        match stderr.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                for &byte in &chunk[..n] {
                    if byte == b'\r' || byte == b'\n' {
                        flush(&mut line, &mut captured);
                    } else {
                        line.push(byte);
                    }
                }
            }
        }
    }
    flush(&mut line, &mut captured);

    let stdout = stdout_reader.join().unwrap_or_default();
    let status = {
        let mut slot = operation.child.lock().expect("operación envenenada");
        let mut child = slot.take().expect("proceso hijo registrado");
        child.wait().map_err(GitError::io)?
    };

    Ok(StreamOutput {
        success: status.success(),
        cancelled: operation.is_cancelled(),
        stdout,
        stderr: captured,
    })
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
    fn check_git_reports_version_for_real_binary() {
        let real = find_in_path("git").expect("git en el PATH");
        let version = check_git(Some(&real)).unwrap();
        assert!(version.chars().next().unwrap().is_ascii_digit());
    }

    #[test]
    fn check_git_rejects_fake_path() {
        let err = check_git(Some(Path::new("/no/existe/git"))).unwrap_err();
        assert_eq!(err.kind, super::super::error::GitErrorKind::GitMissing);
    }

    #[test]
    fn configured_path_is_used_by_following_operations() {
        // Solo se usa una ruta válida: los demás tests corren Git en paralelo.
        let real = find_in_path("git").expect("git en el PATH");
        set_git_path(Some(real.clone()));
        assert_eq!(git_program(), real.into_os_string());
        let out = run_git(&std::env::temp_dir(), ["--version"]).unwrap();
        assert!(String::from_utf8_lossy(&out.stdout).starts_with("git version"));
        set_git_path(None);
        assert_eq!(git_program(), OsString::from("git"));
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

    #[test]
    fn streaming_splits_progress_lines() {
        let op = Operation::default();
        let mut lines = Vec::new();
        let out = run_git_streaming(&std::env::temp_dir(), ["no-such-subcommand"], &op, |l| {
            lines.push(l.to_string())
        })
        .unwrap();
        assert!(!out.success);
        assert!(!out.cancelled);
        assert!(!lines.is_empty());
        assert!(out.stderr.contains("not a git command"));
    }

    #[test]
    fn cancel_kills_waiting_process() {
        // Alias de shell que duerme: simula una operación larga con un proceso nieto.
        let op = std::sync::Arc::new(Operation::default());
        let canceller = op.clone();
        let handle = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            canceller.cancel();
        });
        let started = std::time::Instant::now();
        let out = run_git_streaming(
            &std::env::temp_dir(),
            ["-c", "alias.espera=!sleep 30", "espera"],
            &op,
            |_| {},
        )
        .unwrap();
        handle.join().unwrap();
        assert!(out.cancelled);
        assert!(!out.success);
        assert!(started.elapsed() < std::time::Duration::from_secs(10));
    }

    #[test]
    fn cancel_before_start_prevents_run() {
        let op = Operation::default();
        op.cancel();
        let started = std::time::Instant::now();
        let out = run_git_streaming(
            &std::env::temp_dir(),
            ["-c", "alias.espera=!sleep 30", "espera"],
            &op,
            |_| {},
        )
        .unwrap();
        assert!(out.cancelled && !out.success);
        assert!(started.elapsed() < std::time::Duration::from_secs(10));
    }
}
