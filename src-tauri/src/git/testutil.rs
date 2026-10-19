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

/// URL `file://` válida en cualquier SO: en Windows `C:\\tmp\\r` pasa a `file:///C:/tmp/r`.
pub fn file_url(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    if text.starts_with('/') {
        format!("file://{text}")
    } else {
        format!("file:///{text}")
    }
}

/// Repositorio bare para usar como remoto.
pub fn init_bare() -> TempDir {
    let dir = tempfile::tempdir().unwrap();
    git(dir.path(), &["init", "-q", "--bare", "-b", "main"]);
    dir
}

/// Repositorio sintético con historial ramificado (mismo patrón que `tests/perf/gen_repo.py`):
/// un merge de una rama lateral cada 10 commits de `main`. Se genera con `git fast-import`.
pub fn perf_repo(total: usize) -> TempDir {
    use std::io::Write;
    use std::process::Stdio;

    let dir = init_repo();
    let mut stream = String::with_capacity(total * 160);
    let (mut ts, mut mark) = (1_700_000_000u64, 0u64);
    let (mut main, mut side): (Option<u64>, Option<u64>) = (None, None);
    let mut commit = |stream: &mut String, reference: &str, subject: &str, parents: &[u64]| {
        mark += 1;
        ts += 60;
        let ident = "Perf <perf@example.com>";
        stream.push_str(&format!(
            "commit {reference}\nmark :{mark}\nauthor {ident} {ts} +0000\ncommitter {ident} {ts} +0000\ndata {}\n{subject}\n",
            subject.len()
        ));
        if let Some(first) = parents.first() {
            stream.push_str(&format!("from :{first}\n"));
            for extra in &parents[1..] {
                stream.push_str(&format!("merge :{extra}\n"));
            }
        }
        stream.push('\n');
        mark
    };
    for i in 1..=total {
        if i % 10 == 5 {
            if let Some(m) = main {
                side = Some(commit(
                    &mut stream,
                    "refs/heads/side",
                    &format!("side {i}"),
                    &[m],
                ));
            }
        }
        let parents: Vec<u64> = match (i % 10 == 0, main, side) {
            (true, Some(m), Some(s)) => vec![m, s],
            (_, Some(m), _) => vec![m],
            _ => vec![],
        };
        if i % 10 == 0 && side.is_some() {
            side = None;
        }
        main = Some(commit(
            &mut stream,
            "refs/heads/main",
            &format!("commit {i}"),
            &parents,
        ));
    }
    stream.push_str(&format!("reset refs/heads/main\nfrom :{}\n", main.unwrap()));

    let mut child = Command::new("git")
        .args(["fast-import", "--quiet"])
        .current_dir(dir.path())
        .stdin(Stdio::piped())
        .spawn()
        .expect("no se pudo ejecutar git fast-import");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stream.as_bytes())
        .unwrap();
    assert!(child.wait().unwrap().success(), "git fast-import falló");
    git(dir.path(), &["checkout", "-q", "-f", "main"]);
    dir
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_url_is_valid_for_unix_and_windows_paths() {
        assert_eq!(file_url(Path::new("/tmp/r")), "file:///tmp/r");
        assert_eq!(
            file_url(Path::new("C:\\Users\\ana\\r")),
            "file:///C:/Users/ana/r"
        );
    }
}
