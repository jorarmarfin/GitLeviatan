//! Ramas locales y de seguimiento: listar, crear, cambiar y eliminar.

use std::path::Path;

use super::error::GitError;
use super::operations::is_valid_oid;
use super::process::run_git;
use super::types::{BranchInfo, BranchKind, DeleteBranchOutcome, DeleteReason};

/// `%(HEAD)` vale `*` solo en la rama actual; en detached HEAD ninguna rama lo tiene.
const BRANCH_FORMAT: &str =
    "--format=%(refname)%00%(objectname)%00%(upstream)%00%(upstream:track,nobracket)%00%(HEAD)%1e";

fn parse_track(track: &str) -> (u32, u32) {
    let (mut ahead, mut behind) = (0, 0);
    for part in track.split(", ") {
        if let Some(n) = part.strip_prefix("ahead ") {
            ahead = n.parse().unwrap_or(0);
        } else if let Some(n) = part.strip_prefix("behind ") {
            behind = n.parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

fn short_ref(full: &str) -> &str {
    full.strip_prefix("refs/heads/")
        .or_else(|| full.strip_prefix("refs/remotes/"))
        .unwrap_or(full)
}

pub fn list_branches(repo: &Path) -> Result<Vec<BranchInfo>, GitError> {
    let out = run_git(
        repo,
        ["for-each-ref", BRANCH_FORMAT, "refs/heads", "refs/remotes"],
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut branches = Vec::new();

    for record in text.split('\x1e') {
        let record = record.trim_start_matches('\n');
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split('\0').collect();
        if fields.len() != 5 {
            return Err(GitError::internal(format!(
                "Salida de Git inesperada (rama): {record:?}"
            )));
        }
        let refname = fields[0];
        // `refs/remotes/<remoto>/HEAD` es un alias simbólico, no una rama real.
        if refname.starts_with("refs/remotes/") && refname.ends_with("/HEAD") {
            continue;
        }
        let is_local = refname.starts_with("refs/heads/");
        let (ahead, behind) = parse_track(fields[3]);
        branches.push(BranchInfo {
            name: short_ref(refname).to_string(),
            kind: if is_local {
                BranchKind::Local
            } else {
                BranchKind::Remote
            },
            is_current: is_local && fields[4] == "*",
            upstream: (is_local && !fields[2].is_empty()).then(|| short_ref(fields[2]).to_string()),
            ahead,
            behind,
            tip_oid: fields[1].to_string(),
        });
    }
    Ok(branches)
}

fn invalid_name(name: &str) -> GitError {
    GitError::invalid_input(format!("«{name}» no es un nombre de rama válido para Git."))
}

/// Valida con la propia definición de Git. Se descartan antes los nombres que
/// Git interpretaría como opción (`-x`) o como sintaxis especial (`@{-1}`).
fn validate_branch_name(repo: &Path, name: &str) -> Result<(), GitError> {
    if name.is_empty() || name.starts_with('-') || name.contains("@{") {
        return Err(invalid_name(name));
    }
    run_git(repo, ["check-ref-format", "--branch", name])
        .map(|_| ())
        .map_err(|_| invalid_name(name))
}

fn ref_exists(repo: &Path, full_ref: &str) -> bool {
    run_git(repo, ["rev-parse", "--verify", "--quiet", full_ref]).is_ok()
}

fn current_branch(repo: &Path) -> Option<String> {
    run_git(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn require_plain_name(name: &str) -> Result<(), GitError> {
    if name.is_empty() || name.starts_with('-') {
        return Err(invalid_name(name));
    }
    Ok(())
}

/// Crea una rama local sin cambiarse a ella. `start_point` es un oid o `None` (HEAD).
pub fn create_branch(repo: &Path, name: &str, start_point: Option<&str>) -> Result<(), GitError> {
    validate_branch_name(repo, name)?;
    let mut args = vec!["branch", "--", name];
    if let Some(start) = start_point {
        if !is_valid_oid(start) {
            return Err(GitError::invalid_input(format!(
                "Punto de partida inválido: {start}"
            )));
        }
        args.push(start);
    }
    run_git(repo, args).map(|_| ())
}

/// Cambia a una rama local, o a una remota creando la local con seguimiento.
pub fn checkout_branch(repo: &Path, branch: &str) -> Result<(), GitError> {
    require_plain_name(branch)?;

    let result = if ref_exists(repo, &format!("refs/heads/{branch}")) {
        run_git(repo, ["switch", branch])
    } else if ref_exists(repo, &format!("refs/remotes/{branch}")) {
        let local = branch
            .split_once('/')
            .map(|(_, rest)| rest)
            .filter(|rest| !rest.is_empty())
            .ok_or_else(|| invalid_name(branch))?;
        if ref_exists(repo, &format!("refs/heads/{local}")) {
            return Err(GitError::invalid_input(format!(
                "Ya existe una rama local «{local}». Cámbiate a ella en lugar de a «{branch}»."
            )));
        }
        run_git(repo, ["switch", "-c", local, "--track", branch])
    } else {
        return Err(GitError::invalid_input(format!(
            "La rama «{branch}» no existe."
        )));
    };

    result.map(|_| ()).map_err(|error| {
        let blocked = error
            .detail
            .as_deref()
            .is_some_and(|d| d.contains("would be overwritten") || d.contains("local changes"));
        if blocked {
            GitError {
                message: "Tienes cambios locales que se perderían al cambiar de rama. \
                          Confírmalos o descártalos antes de continuar."
                    .into(),
                ..error
            }
        } else {
            error
        }
    })
}

/// Elimina una rama local. Sin `force` usa `-d`: si no está fusionada devuelve `NeedsForce`.
pub fn delete_branch(
    repo: &Path,
    branch: &str,
    force: bool,
) -> Result<DeleteBranchOutcome, GitError> {
    require_plain_name(branch)?;
    if !ref_exists(repo, &format!("refs/heads/{branch}")) {
        return Err(GitError::invalid_input(format!(
            "No existe la rama local «{branch}»."
        )));
    }
    if current_branch(repo).as_deref() == Some(branch) {
        return Err(GitError::invalid_input(
            "No se puede eliminar la rama actual. Cámbiate a otra antes.",
        ));
    }

    let flag = if force { "-D" } else { "-d" };
    match run_git(repo, ["branch", flag, "--", branch]) {
        Ok(_) => Ok(DeleteBranchOutcome::Deleted),
        Err(error)
            if !force
                && error
                    .detail
                    .as_deref()
                    .is_some_and(|d| d.contains("not fully merged")) =>
        {
            Ok(DeleteBranchOutcome::NeedsForce {
                reason: DeleteReason::NotMerged,
            })
        }
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::error::GitErrorKind;
    use crate::git::testutil::{commit_file, git, init_bare, init_repo};

    fn names(branches: &[BranchInfo], kind: BranchKind) -> Vec<String> {
        branches
            .iter()
            .filter(|b| b.kind == kind)
            .map(|b| b.name.clone())
            .collect()
    }

    /// Repositorio con remoto `origin` (bare local) y `main` publicado.
    fn repo_with_remote() -> (tempfile::TempDir, tempfile::TempDir) {
        let remote = init_bare();
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "uno\n", "base");
        git(
            repo.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        );
        git(repo.path(), &["push", "-q", "-u", "origin", "main"]);
        (repo, remote)
    }

    #[test]
    fn lists_local_branches_and_marks_the_current_one() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        git(repo.path(), &["branch", "feature/x"]);
        let branches = list_branches(repo.path()).unwrap();
        assert_eq!(
            names(&branches, BranchKind::Local),
            vec!["feature/x", "main"]
        );
        let current: Vec<_> = branches.iter().filter(|b| b.is_current).collect();
        assert_eq!(current.len(), 1);
        assert_eq!(current[0].name, "main");
        assert_eq!(current[0].upstream, None);
        assert_eq!(current[0].tip_oid.len(), 40);
    }

    #[test]
    fn no_branch_is_current_in_detached_head() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        git(repo.path(), &["checkout", "-q", "--detach"]);
        let branches = list_branches(repo.path()).unwrap();
        assert!(!branches.is_empty());
        assert!(branches.iter().all(|b| !b.is_current));
    }

    #[test]
    fn empty_repository_has_no_branches() {
        let repo = init_repo();
        assert!(list_branches(repo.path()).unwrap().is_empty());
    }

    #[test]
    fn lists_remote_branches_upstream_and_hides_remote_head() {
        let (repo, _remote) = repo_with_remote();
        git(repo.path(), &["remote", "set-head", "origin", "main"]);
        let branches = list_branches(repo.path()).unwrap();
        assert_eq!(names(&branches, BranchKind::Remote), vec!["origin/main"]);
        let main = branches.iter().find(|b| b.name == "main").unwrap();
        assert_eq!(main.upstream.as_deref(), Some("origin/main"));
        assert_eq!((main.ahead, main.behind), (0, 0));
        let remote = branches.iter().find(|b| b.name == "origin/main").unwrap();
        assert_eq!(remote.upstream, None);
        assert!(!remote.is_current);
    }

    #[test]
    fn reports_ahead_and_behind_against_the_upstream() {
        let (repo, remote) = repo_with_remote();
        // 1 commit local sin publicar (ahead 1)…
        commit_file(repo.path(), "local.txt", "l", "local");
        // …y 2 commits publicados desde otro clon (behind 2 tras el fetch).
        let other = tempfile::tempdir().unwrap();
        git(
            other.path(),
            &["clone", "-q", remote.path().to_str().unwrap(), "."],
        );
        git(other.path(), &["config", "user.name", "Otro"]);
        git(other.path(), &["config", "user.email", "otro@example.com"]);
        for i in 0..2 {
            commit_file(
                other.path(),
                &format!("r{i}.txt"),
                "r",
                &format!("remoto {i}"),
            );
        }
        git(other.path(), &["push", "-q", "origin", "main"]);
        git(repo.path(), &["fetch", "-q", "origin"]);

        let main = list_branches(repo.path())
            .unwrap()
            .into_iter()
            .find(|b| b.name == "main")
            .unwrap();
        assert_eq!((main.ahead, main.behind), (1, 2));
    }

    #[test]
    fn creates_a_branch_from_head_and_from_a_commit() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        let first = String::from_utf8(
            std::process::Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(repo.path())
                .output()
                .unwrap()
                .stdout,
        )
        .unwrap()
        .trim()
        .to_string();
        commit_file(repo.path(), "a.txt", "2", "dos");

        create_branch(repo.path(), "desde-head", None).unwrap();
        create_branch(repo.path(), "desde-commit", Some(&first)).unwrap();
        let branches = list_branches(repo.path()).unwrap();
        let tip = |n: &str| {
            branches
                .iter()
                .find(|b| b.name == n)
                .unwrap()
                .tip_oid
                .clone()
        };
        assert_eq!(tip("desde-commit"), first);
        assert_eq!(tip("desde-head"), tip("main"));
        // Crear no cambia de rama.
        assert!(
            branches
                .iter()
                .find(|b| b.name == "main")
                .unwrap()
                .is_current
        );
    }

    #[test]
    fn invalid_names_are_rejected_without_running_anything() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        for bad in [
            "",
            "con espacios",
            "a..b",
            "-x",
            "@{-1}",
            "a~b",
            "x.lock",
            "HEAD ",
            "a\nb",
        ] {
            let err = create_branch(repo.path(), bad, None).unwrap_err();
            assert_eq!(err.kind, GitErrorKind::InvalidInput, "{bad:?}");
        }
        assert_eq!(list_branches(repo.path()).unwrap().len(), 1);
    }

    #[test]
    fn rejects_existing_names_and_bad_start_points() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        assert!(create_branch(repo.path(), "main", None).is_err());
        assert_eq!(
            create_branch(repo.path(), "otra", Some("--output=/tmp/x"))
                .unwrap_err()
                .kind,
            GitErrorKind::InvalidInput
        );
        assert_eq!(list_branches(repo.path()).unwrap().len(), 1);
    }

    #[test]
    fn checks_out_a_local_branch_carrying_compatible_changes() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(repo.path(), &["branch", "otra"]);
        std::fs::write(repo.path().join("suelto.txt"), "sin conflicto").unwrap();
        checkout_branch(repo.path(), "otra").unwrap();
        let current = list_branches(repo.path())
            .unwrap()
            .into_iter()
            .find(|b| b.is_current)
            .unwrap();
        assert_eq!(current.name, "otra");
    }

    #[test]
    fn checkout_with_conflicting_local_changes_fails_and_stays_put() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "base\n", "base");
        git(repo.path(), &["checkout", "-q", "-b", "otra"]);
        commit_file(repo.path(), "a.txt", "otra\n", "en otra");
        git(repo.path(), &["checkout", "-q", "main"]);
        std::fs::write(repo.path().join("a.txt"), "cambio local sin confirmar\n").unwrap();

        let err = checkout_branch(repo.path(), "otra").unwrap_err();
        assert_eq!(err.kind, GitErrorKind::Command);
        assert!(err.message.contains("cambios locales"));
        assert!(err.detail.unwrap().contains("would be overwritten"));
        let current = list_branches(repo.path())
            .unwrap()
            .into_iter()
            .find(|b| b.is_current)
            .unwrap();
        assert_eq!(current.name, "main");
        assert_eq!(
            std::fs::read_to_string(repo.path().join("a.txt")).unwrap(),
            "cambio local sin confirmar\n"
        );
    }

    #[test]
    fn checking_out_a_remote_branch_creates_a_tracking_local_one() {
        let (repo, _remote) = repo_with_remote();
        git(repo.path(), &["branch", "feature", "main"]);
        git(repo.path(), &["push", "-q", "origin", "feature"]);
        git(repo.path(), &["branch", "-q", "-D", "feature"]);

        checkout_branch(repo.path(), "origin/feature").unwrap();
        let branches = list_branches(repo.path()).unwrap();
        let feature = branches.iter().find(|b| b.name == "feature").unwrap();
        assert!(feature.is_current);
        assert_eq!(feature.kind, BranchKind::Local);
        assert_eq!(feature.upstream.as_deref(), Some("origin/feature"));
    }

    #[test]
    fn remote_checkout_refuses_when_the_local_branch_already_exists() {
        let (repo, _remote) = repo_with_remote();
        let err = checkout_branch(repo.path(), "origin/main").unwrap_err();
        assert_eq!(err.kind, GitErrorKind::InvalidInput);
        assert!(err.message.contains("Ya existe"));
    }

    #[test]
    fn checkout_rejects_unknown_and_option_like_names() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        assert!(checkout_branch(repo.path(), "no-existe").is_err());
        assert!(checkout_branch(repo.path(), "--detach").is_err());
    }

    #[test]
    fn deletes_a_merged_branch() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(repo.path(), &["branch", "fusionada"]);
        assert_eq!(
            delete_branch(repo.path(), "fusionada", false).unwrap(),
            DeleteBranchOutcome::Deleted
        );
        assert_eq!(
            names(&list_branches(repo.path()).unwrap(), BranchKind::Local),
            vec!["main"]
        );
    }

    #[test]
    fn unmerged_branch_needs_force_and_is_kept_until_confirmed() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(repo.path(), &["checkout", "-q", "-b", "sin-fusionar"]);
        commit_file(repo.path(), "b.txt", "2", "solo aquí");
        git(repo.path(), &["checkout", "-q", "main"]);

        assert_eq!(
            delete_branch(repo.path(), "sin-fusionar", false).unwrap(),
            DeleteBranchOutcome::NeedsForce {
                reason: DeleteReason::NotMerged
            }
        );
        assert!(
            names(&list_branches(repo.path()).unwrap(), BranchKind::Local)
                .contains(&"sin-fusionar".to_string())
        );

        assert_eq!(
            delete_branch(repo.path(), "sin-fusionar", true).unwrap(),
            DeleteBranchOutcome::Deleted
        );
        assert_eq!(
            names(&list_branches(repo.path()).unwrap(), BranchKind::Local),
            vec!["main"]
        );
    }

    #[test]
    fn refuses_to_delete_the_current_or_a_missing_or_remote_branch() {
        let (repo, _remote) = repo_with_remote();
        for target in ["main", "no-existe", "origin/main", "-D"] {
            let err = delete_branch(repo.path(), target, true).unwrap_err();
            assert_eq!(err.kind, GitErrorKind::InvalidInput, "{target}");
        }
        assert!(
            names(&list_branches(repo.path()).unwrap(), BranchKind::Local)
                .contains(&"main".to_string())
        );
    }

    #[test]
    fn serializes_delete_outcome_as_tagged_json() {
        assert_eq!(
            serde_json::to_string(&DeleteBranchOutcome::Deleted).unwrap(),
            r#"{"status":"deleted"}"#
        );
        assert_eq!(
            serde_json::to_string(&DeleteBranchOutcome::NeedsForce {
                reason: DeleteReason::NotMerged
            })
            .unwrap(),
            r#"{"status":"needsForce","reason":"notMerged"}"#
        );
    }
}
