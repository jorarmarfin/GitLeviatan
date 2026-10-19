//! Remotos: listado y saneado de URLs.

use std::path::Path;

use super::error::GitError;
use super::process::run_git;
use super::types::RemoteInfo;

/// Elimina `usuario:token@` de toda URL con esquema que aparezca en `text`.
///
/// En `http(s)`/`ftp` se quita siempre la parte de usuario; en otros esquemas (p. ej.
/// `ssh://git@host`) solo si lleva contraseña, porque el usuario SSH no es un secreto.
/// Sirve tanto para una URL suelta como para texto libre (stderr de Git).
pub fn sanitize_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find("://") {
        let (head, tail) = rest.split_at(pos + 3);
        out.push_str(head);
        let authority_end = tail
            .find(|c: char| {
                matches!(c, '/' | '?' | '#') || c.is_whitespace() || "'\"<>".contains(c)
            })
            .unwrap_or(tail.len());
        let (authority, after) = tail.split_at(authority_end);
        match authority.rfind('@') {
            Some(at) => {
                let userinfo = &authority[..at];
                let scheme = head[..head.len() - 3]
                    .rsplit(|c: char| !c.is_ascii_alphanumeric() && !"+-.".contains(c))
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let web = matches!(scheme.as_str(), "http" | "https" | "ftp" | "ftps");
                if web || userinfo.contains(':') {
                    out.push_str(&authority[at + 1..]);
                } else {
                    out.push_str(authority);
                }
            }
            None => out.push_str(authority),
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

pub fn list_remotes(repo: &Path) -> Result<Vec<RemoteInfo>, GitError> {
    let out = run_git(repo, ["remote", "-v"])?;
    Ok(parse_remotes(&String::from_utf8_lossy(&out.stdout)))
}

/// Interpreta `git remote -v`: `nombre\turl (fetch|push)`.
fn parse_remotes(text: &str) -> Vec<RemoteInfo> {
    let mut remotes: Vec<RemoteInfo> = Vec::new();
    let mut push_seen: Vec<String> = Vec::new();
    for line in text.lines() {
        let Some((name, rest)) = line.split_once('\t') else {
            continue;
        };
        let (url, direction) = if let Some(url) = rest.strip_suffix(" (fetch)") {
            (url, "fetch")
        } else if let Some(url) = rest.strip_suffix(" (push)") {
            (url, "push")
        } else {
            continue;
        };
        let url = sanitize_text(url);
        let index = match remotes.iter().position(|r| r.name == name) {
            Some(i) => i,
            None => {
                remotes.push(RemoteInfo {
                    name: name.to_string(),
                    fetch_url: String::new(),
                    push_url: String::new(),
                });
                remotes.len() - 1
            }
        };
        if direction == "fetch" {
            remotes[index].fetch_url = url;
        } else if !push_seen.iter().any(|n| n == name) {
            // Con varias URLs de push se muestra la primera.
            push_seen.push(name.to_string());
            remotes[index].push_url = url;
        }
    }
    remotes
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{git, init_repo};
    use super::*;

    #[test]
    fn strips_credentials_from_https() {
        assert_eq!(
            sanitize_text("https://usuario:ghp_token@github.com/o/r.git"),
            "https://github.com/o/r.git"
        );
        assert_eq!(
            sanitize_text("https://soloToken@github.com/o/r.git"),
            "https://github.com/o/r.git"
        );
    }

    #[test]
    fn keeps_ssh_user_but_strips_ssh_password() {
        assert_eq!(
            sanitize_text("ssh://git@github.com/o/r.git"),
            "ssh://git@github.com/o/r.git"
        );
        assert_eq!(
            sanitize_text("ssh://git:secreto@host/o/r.git"),
            "ssh://host/o/r.git"
        );
        assert_eq!(
            sanitize_text("git@github.com:o/r.git"),
            "git@github.com:o/r.git"
        );
    }

    #[test]
    fn sanitizes_urls_inside_free_text() {
        let text = "fatal: unable to access 'https://u:tok@host.com/r.git/': Could not resolve host\nremote: see https://x:y@a.b/c y http://k@z.org";
        let clean = sanitize_text(text);
        assert!(!clean.contains("tok"));
        assert!(!clean.contains("x:y"));
        assert!(!clean.contains("k@"));
        assert!(clean.contains("'https://host.com/r.git/'"));
        assert!(clean.contains("http://z.org"));
    }

    #[test]
    fn leaves_plain_text_and_paths_untouched() {
        assert_eq!(sanitize_text("/ruta/a/repo"), "/ruta/a/repo");
        assert_eq!(sanitize_text("file:///tmp/r@1"), "file:///tmp/r@1");
        assert_eq!(sanitize_text("correo a@b.com"), "correo a@b.com");
    }

    #[test]
    fn parses_remote_listing() {
        let text = "origin\thttps://u:t@h.com/r.git (fetch)\norigin\thttps://u:t@h.com/r.git (push)\nup\tgit@h.com:o/r.git (fetch)\nup\tgit@h.com:o/r.git (push)\n";
        let remotes = parse_remotes(text);
        assert_eq!(remotes.len(), 2);
        assert_eq!(remotes[0].name, "origin");
        assert_eq!(remotes[0].fetch_url, "https://h.com/r.git");
        assert_eq!(remotes[0].push_url, "https://h.com/r.git");
        assert_eq!(remotes[1].fetch_url, "git@h.com:o/r.git");
    }

    #[test]
    fn lists_remotes_of_real_repo_without_credentials() {
        let repo = init_repo();
        git(
            repo.path(),
            &[
                "remote",
                "add",
                "origin",
                "https://usuario:token123@example.com/o/r.git",
            ],
        );
        let remotes = list_remotes(repo.path()).unwrap();
        assert_eq!(remotes.len(), 1);
        assert_eq!(remotes[0].fetch_url, "https://example.com/o/r.git");
        assert!(!remotes[0].push_url.contains("token123"));
    }

    #[test]
    fn no_remotes_gives_empty_list() {
        let repo = init_repo();
        assert!(list_remotes(repo.path()).unwrap().is_empty());
    }
}
