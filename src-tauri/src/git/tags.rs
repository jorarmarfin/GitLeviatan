//! Tags locales: listar, crear, eliminar, resolver referencias y sugerir versiones de release.

use std::path::Path;

use super::error::AppError;
use super::process::run_git;
use super::types::{ReleaseCommit, ReleaseSuggestion, TagInfo, TagKind};

/// Máximo de commits que se listan como ayuda para las notas de una release.
const MAX_RELEASE_COMMITS: usize = 200;

const TAG_FORMAT: &str = "--format=%(refname)%00%(objecttype)%00%(objectname)%00%(*objectname)%00%(creatordate:iso-strict)%00%(contents)%1e";

fn text(out: &super::process::GitOutput) -> String {
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

pub fn list_tags(repo: &Path) -> Result<Vec<TagInfo>, AppError> {
    let out = run_git(
        repo,
        [
            "for-each-ref",
            "--sort=-version:refname",
            TAG_FORMAT,
            "refs/tags",
        ],
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut tags = Vec::new();

    for record in text.split('\x1e') {
        let record = record.trim_start_matches('\n');
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split('\0').collect();
        if fields.len() != 6 {
            return Err(AppError::internal(format!(
                "Salida de Git inesperada (tag): {record:?}"
            )));
        }
        let name = fields[0].strip_prefix("refs/tags/").unwrap_or(fields[0]);
        let annotated = fields[1] == "tag";
        let message = fields[5].trim();
        tags.push(TagInfo {
            name: name.to_string(),
            kind: if annotated {
                TagKind::Annotated
            } else {
                TagKind::Lightweight
            },
            target_oid: if annotated { fields[3] } else { fields[2] }.to_string(),
            tag_oid: annotated.then(|| fields[2].to_string()),
            message: (annotated && !message.is_empty()).then(|| message.to_string()),
            tagger_date: (!fields[4].is_empty()).then(|| fields[4].to_string()),
            exists_local: true,
            exists_remote: None,
        });
    }
    Ok(tags)
}

fn invalid_name(name: &str) -> AppError {
    AppError::invalid_input(format!("«{name}» no es un nombre de tag válido para Git."))
}

/// Nombres que Git no interpretará como opción ni como sintaxis especial, y válidos para
/// `refs/tags/<nombre>` según el propio Git.
pub fn validate_tag_name(repo: &Path, name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.starts_with('-') || name.contains("@{") {
        return Err(invalid_name(name));
    }
    run_git(repo, ["check-ref-format", &format!("refs/tags/{name}")])
        .map(|_| ())
        .map_err(|_| invalid_name(name))
}

fn tag_exists(repo: &Path, name: &str) -> bool {
    run_git(
        repo,
        [
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/tags/{name}"),
        ],
    )
    .is_ok()
}

/// Resuelve una rama, tag, oid o expresión (`HEAD~3`) al oid del commit al que apunta.
pub fn resolve_ref(repo: &Path, expression: &str) -> Result<String, AppError> {
    let expression = expression.trim();
    if expression.is_empty()
        || expression.starts_with('-')
        || expression.contains(char::is_whitespace)
    {
        return Err(AppError::invalid_input(format!(
            "«{expression}» no es una referencia válida."
        )));
    }
    run_git(
        repo,
        [
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{expression}^{{commit}}"),
        ],
    )
    .map(|out| text(&out))
    .map_err(|_| {
        AppError::invalid_input(format!(
            "«{expression}» no es una rama, un tag ni un commit existente."
        ))
    })
}

/// Crea un tag. Con `message` (no vacío) es anotado; sin él, ligero. `target` es cualquier
/// expresión que `resolve_ref` acepte; `None` es `HEAD`.
pub fn create_tag(
    repo: &Path,
    name: &str,
    target: Option<&str>,
    message: Option<&str>,
) -> Result<(), AppError> {
    validate_tag_name(repo, name)?;
    if tag_exists(repo, name) {
        return Err(AppError::invalid_input(format!(
            "Ya existe un tag llamado «{name}»."
        )));
    }
    let oid = resolve_ref(repo, target.unwrap_or("HEAD"))?;
    let message = message.map(str::trim).filter(|m| !m.is_empty());
    match message {
        Some(message) => run_git(repo, ["tag", "-a", "-m", message, "--", name, &oid]),
        None => run_git(repo, ["tag", "--", name, &oid]),
    }
    .map(|_| ())
}

pub fn delete_tag(repo: &Path, name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.starts_with('-') || !tag_exists(repo, name) {
        return Err(AppError::invalid_input(format!(
            "No existe el tag local «{name}»."
        )));
    }
    run_git(repo, ["tag", "-d", "--", name]).map(|_| ())
}

type Version = (u64, u64, u64);

/// `vX.Y.Z` o `X.Y.Z`: devuelve si lleva prefijo `v` y los tres números.
fn parse_version(name: &str) -> Option<(bool, Version)> {
    let (prefixed, rest) = match name.strip_prefix('v') {
        Some(rest) => (true, rest),
        None => (false, name),
    };
    let mut parts = rest.split('.');
    let mut next = || {
        let part = parts.next()?;
        (!part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
            .then(|| part.parse::<u64>().ok())
            .flatten()
    };
    let version = (next()?, next()?, next()?);
    parts.next().is_none().then_some((prefixed, version))
}

fn format_version(prefixed: bool, (major, minor, patch): Version) -> String {
    format!("{}{major}.{minor}.{patch}", if prefixed { "v" } else { "" })
}

/// Último tag semántico (el de mayor versión) y los tres siguientes posibles.
fn suggest_versions(tag_names: &[String]) -> Option<(String, String, String, String)> {
    let (name, prefixed, (major, minor, patch)) = tag_names
        .iter()
        .filter_map(|name| parse_version(name).map(|(p, v)| (name, p, v)))
        .max_by_key(|(_, _, v)| *v)?;
    Some((
        name.clone(),
        format_version(prefixed, (major, minor, patch + 1)),
        format_version(prefixed, (major, minor + 1, 0)),
        format_version(prefixed, (major + 1, 0, 0)),
    ))
}

fn commits_since(repo: &Path, last_tag: Option<&str>) -> Vec<ReleaseCommit> {
    let range = last_tag.map_or_else(
        || "HEAD".to_string(),
        |tag| format!("refs/tags/{tag}..HEAD"),
    );
    let limit = format!("--max-count={MAX_RELEASE_COMMITS}");
    let Ok(out) = run_git(repo, ["log", &limit, "--format=%H%x00%s%x1e", &range, "--"]) else {
        return Vec::new();
    };
    String::from_utf8_lossy(&out.stdout)
        .split('\x1e')
        .filter_map(|record| {
            let (oid, subject) = record.trim_start_matches('\n').split_once('\0')?;
            Some(ReleaseCommit {
                oid: oid.to_string(),
                subject: subject.to_string(),
            })
        })
        .collect()
}

fn behind_upstream(repo: &Path) -> u32 {
    run_git(repo, ["rev-list", "--count", "HEAD..@{upstream}"])
        .ok()
        .and_then(|out| text(&out).parse().ok())
        .unwrap_or(0)
}

/// Datos para el asistente de release: versiones sugeridas, commits desde el último tag
/// semántico y cuántos commits va detrás la rama de su upstream.
pub fn release_suggestion(repo: &Path) -> Result<ReleaseSuggestion, AppError> {
    let names: Vec<String> = list_tags(repo)?.into_iter().map(|t| t.name).collect();
    let suggested = suggest_versions(&names);
    let last_tag = suggested.as_ref().map(|(last, ..)| last.clone());
    let commits = commits_since(repo, last_tag.as_deref());
    let (patch, minor, major) = match suggested {
        Some((_, patch, minor, major)) => (Some(patch), Some(minor), Some(major)),
        None => (None, None, None),
    };
    Ok(ReleaseSuggestion {
        last_tag,
        patch,
        minor,
        major,
        commits_since_last_tag: commits,
        behind_upstream: behind_upstream(repo),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::error::AppErrorKind;
    use crate::git::testutil::{commit_file, git, init_bare, init_repo};

    fn rev(dir: &Path, spec: &str) -> String {
        text(&run_git(dir, ["rev-parse", spec]).unwrap())
    }

    fn names(tags: &[TagInfo]) -> Vec<&str> {
        tags.iter().map(|t| t.name.as_str()).collect()
    }

    #[test]
    fn empty_repository_has_no_tags() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        assert!(list_tags(repo.path()).unwrap().is_empty());
    }

    #[test]
    fn lists_lightweight_and_annotated_tags() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        let head = rev(repo.path(), "HEAD");
        git(repo.path(), &["tag", "ligero"]);
        git(
            repo.path(),
            &["tag", "-a", "v1.0.0", "-m", "primera\n\ndetalle"],
        );

        let tags = list_tags(repo.path()).unwrap();
        let light = tags.iter().find(|t| t.name == "ligero").unwrap();
        assert_eq!(light.kind, TagKind::Lightweight);
        assert_eq!(light.target_oid, head);
        assert_eq!(light.tag_oid, None);
        assert_eq!(light.message, None);
        assert!(light.tagger_date.is_some());
        assert!(light.exists_local);
        assert_eq!(light.exists_remote, None);

        let annotated = tags.iter().find(|t| t.name == "v1.0.0").unwrap();
        assert_eq!(annotated.kind, TagKind::Annotated);
        assert_eq!(annotated.target_oid, head);
        assert_eq!(
            annotated.tag_oid.as_deref(),
            Some(rev(repo.path(), "v1.0.0").as_str())
        );
        assert_eq!(annotated.message.as_deref(), Some("primera\n\ndetalle"));
    }

    #[test]
    fn orders_tags_by_version_descending() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        for tag in ["v1.2.0", "v1.10.0", "v1.9.0"] {
            git(repo.path(), &["tag", tag]);
        }
        let tags = list_tags(repo.path()).unwrap();
        assert_eq!(names(&tags), vec!["v1.10.0", "v1.9.0", "v1.2.0"]);
    }

    #[test]
    fn creates_a_lightweight_tag_at_head() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        create_tag(repo.path(), "marca", None, None).unwrap();
        let tags = list_tags(repo.path()).unwrap();
        assert_eq!(tags[0].kind, TagKind::Lightweight);
        assert_eq!(tags[0].target_oid, rev(repo.path(), "HEAD"));
    }

    #[test]
    fn creates_an_annotated_tag_equal_to_the_cli_one() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        create_tag(repo.path(), "v1.0.0", None, Some("Primera release")).unwrap();
        let object = text(&run_git(repo.path(), ["cat-file", "-t", "v1.0.0"]).unwrap());
        assert_eq!(object, "tag");
        let tags = list_tags(repo.path()).unwrap();
        assert_eq!(tags[0].kind, TagKind::Annotated);
        assert_eq!(tags[0].message.as_deref(), Some("Primera release"));
    }

    #[test]
    fn a_blank_message_makes_a_lightweight_tag() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        create_tag(repo.path(), "marca", None, Some("   ")).unwrap();
        assert_eq!(
            list_tags(repo.path()).unwrap()[0].kind,
            TagKind::Lightweight
        );
    }

    #[test]
    fn creates_a_tag_on_an_old_commit() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        let first = rev(repo.path(), "HEAD");
        commit_file(repo.path(), "a.txt", "2", "dos");
        create_tag(repo.path(), "v0.1.0", Some(&first), Some("vieja")).unwrap();
        create_tag(repo.path(), "v0.2.0", Some("HEAD~1"), None).unwrap();
        let tags = list_tags(repo.path()).unwrap();
        assert!(tags.iter().all(|t| t.target_oid == first));
    }

    #[test]
    fn rejects_invalid_and_duplicate_tag_names() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        for bad in ["", "-x", "a b", "a..b", "x@{1}", "a~b", "fin."] {
            let error = create_tag(repo.path(), bad, None, None).unwrap_err();
            assert_eq!(error.kind, AppErrorKind::Validation, "{bad:?}");
        }
        create_tag(repo.path(), "v1", None, None).unwrap();
        let error = create_tag(repo.path(), "v1", None, None).unwrap_err();
        assert!(error.message.contains("Ya existe"));
        assert_eq!(list_tags(repo.path()).unwrap().len(), 1);
    }

    #[test]
    fn rejects_an_unknown_target() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        let error = create_tag(repo.path(), "v1", Some("no-existe"), None).unwrap_err();
        assert_eq!(error.kind, AppErrorKind::Validation);
        assert!(list_tags(repo.path()).unwrap().is_empty());
    }

    #[test]
    fn deletes_a_local_tag() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        git(repo.path(), &["tag", "v1"]);
        delete_tag(repo.path(), "v1").unwrap();
        assert!(list_tags(repo.path()).unwrap().is_empty());
        let error = delete_tag(repo.path(), "v1").unwrap_err();
        assert_eq!(error.kind, AppErrorKind::Validation);
        assert_eq!(
            delete_tag(repo.path(), "-d").unwrap_err().kind,
            AppErrorKind::Validation
        );
    }

    #[test]
    fn resolves_branches_tags_short_oids_and_expressions() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        let first = rev(repo.path(), "HEAD");
        commit_file(repo.path(), "a.txt", "2", "dos");
        let second = rev(repo.path(), "HEAD");
        git(repo.path(), &["tag", "-a", "v1", "-m", "m", &first]);
        git(repo.path(), &["branch", "feature", &first]);

        assert_eq!(resolve_ref(repo.path(), "HEAD").unwrap(), second);
        assert_eq!(resolve_ref(repo.path(), "HEAD~1").unwrap(), first);
        assert_eq!(resolve_ref(repo.path(), "feature").unwrap(), first);
        // Un tag anotado se resuelve al commit, no al objeto tag.
        assert_eq!(resolve_ref(repo.path(), "v1").unwrap(), first);
        assert_eq!(resolve_ref(repo.path(), &first[..7]).unwrap(), first);
    }

    #[test]
    fn resolves_a_remote_branch() {
        let remote = init_bare();
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        git(
            repo.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        );
        git(repo.path(), &["push", "-q", "-u", "origin", "main"]);
        assert_eq!(
            resolve_ref(repo.path(), "origin/main").unwrap(),
            rev(repo.path(), "HEAD")
        );
    }

    #[test]
    fn rejects_invalid_expressions() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "x", "base");
        for bad in [
            "",
            "   ",
            "--all",
            "-x",
            "no existe",
            "ramaquenoexiste",
            "HEAD~99",
        ] {
            assert_eq!(
                resolve_ref(repo.path(), bad).unwrap_err().kind,
                AppErrorKind::Validation,
                "{bad:?}"
            );
        }
    }

    #[test]
    fn parses_semantic_versions() {
        assert_eq!(parse_version("v1.2.3"), Some((true, (1, 2, 3))));
        assert_eq!(parse_version("1.2.3"), Some((false, (1, 2, 3))));
        for bad in [
            "v1.2",
            "v1.2.3.4",
            "v1.2.x",
            "release-1",
            "v1.2.3-rc1",
            "v",
            "",
        ] {
            assert_eq!(parse_version(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn suggests_the_next_versions_from_the_highest_semantic_tag() {
        let tags: Vec<String> = ["nightly", "v0.9.0", "v0.10.2", "v0.3.1"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(
            suggest_versions(&tags),
            Some((
                "v0.10.2".into(),
                "v0.10.3".into(),
                "v0.11.0".into(),
                "v1.0.0".into()
            ))
        );
        assert_eq!(suggest_versions(&["nightly".to_string()]), None);
        assert_eq!(suggest_versions(&[]), None);
    }

    #[test]
    fn release_suggestion_lists_commits_since_the_last_semantic_tag() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(repo.path(), &["tag", "-a", "v1.4.0", "-m", "x"]);
        commit_file(repo.path(), "a.txt", "2", "dos");
        commit_file(repo.path(), "a.txt", "3", "tres");

        let s = release_suggestion(repo.path()).unwrap();
        assert_eq!(s.last_tag.as_deref(), Some("v1.4.0"));
        assert_eq!(s.patch.as_deref(), Some("v1.4.1"));
        assert_eq!(s.minor.as_deref(), Some("v1.5.0"));
        assert_eq!(s.major.as_deref(), Some("v2.0.0"));
        let subjects: Vec<_> = s
            .commits_since_last_tag
            .iter()
            .map(|c| c.subject.as_str())
            .collect();
        assert_eq!(subjects, vec!["tres", "dos"]);
        assert_eq!(s.behind_upstream, 0);
    }

    #[test]
    fn release_suggestion_without_semantic_tags_has_no_versions() {
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(repo.path(), &["tag", "nightly"]);
        let s = release_suggestion(repo.path()).unwrap();
        assert_eq!(s.last_tag, None);
        assert_eq!((s.patch, s.minor, s.major), (None, None, None));
        assert_eq!(s.commits_since_last_tag.len(), 1);
    }

    #[test]
    fn release_suggestion_reports_how_far_behind_the_upstream_is() {
        let remote = init_bare();
        let repo = init_repo();
        commit_file(repo.path(), "a.txt", "1", "uno");
        git(
            repo.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        );
        git(repo.path(), &["push", "-q", "-u", "origin", "main"]);
        commit_file(repo.path(), "a.txt", "2", "dos");
        git(repo.path(), &["push", "-q", "origin", "main"]);
        git(repo.path(), &["reset", "-q", "--hard", "HEAD~1"]);
        assert_eq!(release_suggestion(repo.path()).unwrap().behind_upstream, 1);
    }

    #[test]
    fn release_suggestion_works_in_an_empty_repository() {
        let repo = init_repo();
        let s = release_suggestion(repo.path()).unwrap();
        assert_eq!(s.last_tag, None);
        assert!(s.commits_since_last_tag.is_empty());
    }
}
