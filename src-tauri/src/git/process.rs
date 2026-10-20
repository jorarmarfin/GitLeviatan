use std::ffi::{OsStr, OsString};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, RwLock};

use super::error::AppError;

/// Ejecutable de Git elegido en las preferencias; `None` = buscarlo (ver `resolve_git`).
static GIT_PATH: RwLock<Option<PathBuf>> = RwLock::new(None);

/// Cambia el ejecutable de Git; afecta a las operaciones siguientes sin reiniciar.
pub fn set_git_path(path: Option<PathBuf>) {
    *GIT_PATH.write().expect("ruta de Git envenenada") = path;
}

/// Nombre del ejecutable de Git en el `PATH`.
const GIT_FILE: &str = if cfg!(windows) { "git.exe" } else { "git" };

/// Sitios habituales de Git cuando no está en el `PATH`. Una app abierta desde el Finder de
/// macOS o desde un lanzador de Linux recibe un `PATH` mínimo, sin Homebrew ni `/usr/local`.
fn well_known_git_locations() -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        for variable in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
            if let Some(base) = std::env::var_os(variable) {
                found.push(PathBuf::from(base).join("Git").join("cmd").join(GIT_FILE));
            }
        }
        if let Some(base) = std::env::var_os("LOCALAPPDATA") {
            found.push(
                PathBuf::from(base)
                    .join("Programs")
                    .join("Git")
                    .join("cmd")
                    .join(GIT_FILE),
            );
        }
    } else if cfg!(target_os = "macos") {
        found.extend(
            [
                "/opt/homebrew/bin/git",
                "/usr/local/bin/git",
                "/usr/bin/git",
            ]
            .map(PathBuf::from),
        );
    } else {
        found.extend(["/usr/local/bin/git", "/usr/bin/git"].map(PathBuf::from));
    }
    found
}

/// Busca un ejecutable por nombre en una lista de directorios (formato del `PATH`).
fn find_in(path_env: Option<&OsStr>, name: &str) -> Option<PathBuf> {
    std::env::split_paths(path_env?)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

/// Decide qué ejecutar: la ruta de las preferencias; si no, `git` del `PATH`; si no, el primer
/// Git de los sitios habituales; y, como último recurso, `git` (el error dirá que falta).
fn resolve_git(configured: Option<&Path>, path_env: Option<&OsStr>, known: &[PathBuf]) -> OsString {
    if let Some(path) = configured {
        return path.as_os_str().to_owned();
    }
    if find_in(path_env, GIT_FILE).is_some() {
        return OsString::from("git");
    }
    known
        .iter()
        .find(|candidate| candidate.is_file())
        .map_or_else(|| OsString::from("git"), |p| p.as_os_str().to_owned())
}

fn git_program() -> OsString {
    let configured = GIT_PATH.read().expect("ruta de Git envenenada").clone();
    resolve_git(
        configured.as_deref(),
        std::env::var_os("PATH").as_deref(),
        &well_known_git_locations(),
    )
}

/// En Windows una app gráfica que lanza `git.exe` abriría una ventana de consola por proceso.
#[cfg(windows)]
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_command: &mut Command) {}

fn git_command() -> Command {
    let mut command = Command::new(git_program());
    hide_window(&mut command);
    // Las rutas de más de 260 caracteres solo funcionan en Windows con esta opción.
    #[cfg(windows)]
    command.args(["-c", "core.longpaths=true"]);
    command
}

/// Busca un ejecutable por nombre en el `PATH` (apoyo de las pruebas).
#[cfg(test)]
pub fn find_in_path(name: &str) -> Option<PathBuf> {
    // En Windows los ejecutables llevan `.exe`: `git` → `git.exe`.
    let file = format!("{name}{}", std::env::consts::EXE_SUFFIX);
    find_in(std::env::var_os("PATH").as_deref(), &file)
}

/// Ejecuta `<git> --version` y devuelve la versión (`2.43.0`). Con `None` usa la ruta
/// configurada actualmente (o la que `resolve_git` encuentre).
pub fn check_git(program: Option<&Path>) -> Result<String, AppError> {
    let mut command = match program {
        Some(path) => {
            let mut command = Command::new(path);
            hide_window(&mut command);
            command
        }
        None => git_command(),
    };
    let output = command
        .arg("--version")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => AppError::git_missing(),
            std::io::ErrorKind::PermissionDenied => {
                AppError::invalid_input("No se puede ejecutar el archivo seleccionado.")
            }
            _ => AppError::io(error),
        })?;
    let text = String::from_utf8_lossy(&output.stdout);
    match text.trim().strip_prefix("git version ") {
        Some(version) if output.status.success() => Ok(version.to_string()),
        _ => Err(AppError::invalid_input(
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
pub fn run_git<I, S>(dir: &Path, args: I) -> Result<GitOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run(dir, args, None)
}

/// Igual que `run_git`, pero escribe `input` en la entrada estándar de Git.
pub fn run_git_with_input<I, S>(dir: &Path, args: I, input: &[u8]) -> Result<GitOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run(dir, args, Some(input))
}

fn run<I, S>(dir: &Path, args: I, input: Option<&[u8]>) -> Result<GitOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    if !dir.is_dir() {
        return Err(AppError::not_found(dir));
    }

    let to_error = |error: std::io::Error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::git_missing()
        } else {
            AppError::io(error)
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
    let output = child.wait_with_output().map_err(AppError::io)?;

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
        Err(AppError::command(message))
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
    #[cfg(windows)]
    {
        // `/T` termina también a los procesos hijos (ssh, git-remote-https…).
        let mut taskkill = Command::new("taskkill");
        taskkill
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_window(&mut taskkill);
        let _ = taskkill.status();
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
) -> Result<StreamOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    if !dir.is_dir() {
        return Err(AppError::not_found(dir));
    }
    // Cancelada antes de arrancar: ni siquiera se lanza Git. Matar un proceso recién creado no es
    // fiable (en Windows puede dejar huérfanos los procesos nietos con los pipes abiertos).
    if operation.is_cancelled() {
        return Ok(StreamOutput {
            success: false,
            cancelled: true,
            stdout: Vec::new(),
            stderr: String::new(),
        });
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
            AppError::git_missing()
        } else {
            AppError::io(error)
        }
    })?;
    let mut stderr = child.stderr.take().expect("stderr es piped");
    let mut stdout = child.stdout.take().expect("stdout es piped");

    {
        let mut slot = operation.child.lock().expect("operación envenenada");
        // Cancelada justo después del chequeo anterior (carrera estrecha): se mata lo ya arrancado.
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
        child.wait().map_err(AppError::io)?
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
        assert_eq!(err.kind, super::super::error::AppErrorKind::Git);
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

    fn fake_git_in(dir: &Path) -> PathBuf {
        let file = dir.join(GIT_FILE);
        std::fs::write(&file, "").unwrap();
        file
    }

    #[test]
    fn resolve_prefers_the_configured_path_over_everything() {
        let dir = tempfile::tempdir().unwrap();
        fake_git_in(dir.path());
        let configured = Path::new("/elegido/por/el/usuario/git");
        let path_env = std::env::join_paths([dir.path()]).unwrap();
        let resolved = resolve_git(Some(configured), Some(path_env.as_os_str()), &[]);
        assert_eq!(resolved, configured.as_os_str());
    }

    #[test]
    fn resolve_uses_plain_git_when_it_is_in_the_path() {
        let dir = tempfile::tempdir().unwrap();
        fake_git_in(dir.path());
        let path_env = std::env::join_paths([dir.path()]).unwrap();
        let known = [PathBuf::from("/otro/git")];
        assert_eq!(
            resolve_git(None, Some(path_env.as_os_str()), &known),
            OsString::from("git")
        );
    }

    #[test]
    fn resolve_falls_back_to_well_known_locations_when_path_has_no_git() {
        // Caso típico de macOS: app abierta desde el Finder con un PATH mínimo.
        let empty_path_dir = tempfile::tempdir().unwrap();
        let homebrew = tempfile::tempdir().unwrap();
        let installed = fake_git_in(homebrew.path());
        let path_env = std::env::join_paths([empty_path_dir.path()]).unwrap();
        let known = [
            homebrew.path().join("no-existe").join(GIT_FILE),
            installed.clone(),
        ];
        assert_eq!(
            resolve_git(None, Some(path_env.as_os_str()), &known),
            installed.into_os_string()
        );
    }

    #[test]
    fn resolve_gives_plain_git_when_nothing_is_found() {
        let dir = tempfile::tempdir().unwrap();
        let path_env = std::env::join_paths([dir.path()]).unwrap();
        let known = [dir.path().join("fantasma").join(GIT_FILE)];
        assert_eq!(
            resolve_git(None, Some(path_env.as_os_str()), &known),
            OsString::from("git")
        );
        assert_eq!(resolve_git(None, None, &[]), OsString::from("git"));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn macos_knows_homebrew_locations() {
        let known = well_known_git_locations();
        assert!(known.contains(&PathBuf::from("/opt/homebrew/bin/git")));
        assert!(known.contains(&PathBuf::from("/usr/local/bin/git")));
    }

    #[test]
    #[cfg(windows)]
    fn windows_looks_for_git_exe_under_program_files() {
        assert_eq!(GIT_FILE, "git.exe");
        let known = well_known_git_locations();
        assert!(known
            .iter()
            .all(|p| p.ends_with(Path::new("cmd").join("git.exe"))));
        assert!(!known.is_empty());
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn linux_knows_usr_bin() {
        assert!(well_known_git_locations().contains(&PathBuf::from("/usr/bin/git")));
    }

    #[test]
    fn rejects_missing_directory() {
        let err = run_git(Path::new("/no/existe/gitleviatan"), ["status"]).unwrap_err();
        assert_eq!(err.kind, super::super::error::AppErrorKind::NotFound);
    }

    #[test]
    fn reports_git_failure() {
        let err = run_git(&std::env::temp_dir(), ["no-such-subcommand"]).unwrap_err();
        assert_eq!(err.kind, super::super::error::AppErrorKind::Git);
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
        // No llega a lanzar Git: no hay salida y el retorno es inmediato, no «antes de 10 s».
        assert!(out.stdout.is_empty() && out.stderr.is_empty());
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
    }
}
