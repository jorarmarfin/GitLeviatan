use std::path::Path;
use std::process::Command;

use tempfile::TempDir;

pub fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .expect("no se pudo ejecutar git");
    assert!(
        out.status.success(),
        "git {args:?} falló: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// Repositorio temporal con identidad fija y sin depender de la config global.
pub fn init_repo() -> TempDir {
    let dir = tempfile::tempdir().unwrap();
    git(dir.path(), &["init", "-q", "-b", "main"]);
    git(dir.path(), &["config", "user.name", "Prueba"]);
    git(dir.path(), &["config", "user.email", "prueba@example.com"]);
    git(dir.path(), &["config", "commit.gpgsign", "false"]);
    git(dir.path(), &["config", "core.autocrlf", "false"]);
    dir
}

pub fn commit_file(dir: &Path, name: &str, content: &str, message: &str) {
    std::fs::write(dir.join(name), content).unwrap();
    git(dir, &["add", "--", name]);
    git(dir, &["commit", "-q", "-m", message]);
}
