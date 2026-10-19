use super::error::GitError;
use super::types::{ChangeKind, ChangedFile, CommitNode, RepositoryStatus};

fn parse_error(what: &str, record: &str) -> GitError {
    GitError::internal(format!("Salida de Git inesperada ({what}): {record:?}"))
}

fn kind_of(code: char) -> ChangeKind {
    match code {
        'A' => ChangeKind::Added,
        'D' => ChangeKind::Deleted,
        'R' => ChangeKind::Renamed,
        'C' => ChangeKind::Copied,
        'T' => ChangeKind::Typechange,
        _ => ChangeKind::Modified,
    }
}

fn push_xy(status: &mut RepositoryStatus, xy: &str, path: &str, orig: Option<&str>) {
    let mut codes = xy.chars();
    let (x, y) = (codes.next().unwrap_or('.'), codes.next().unwrap_or('.'));
    for (code, list) in [(x, true), (y, false)] {
        if code == '.' {
            continue;
        }
        let kind = kind_of(code);
        let orig_path = match kind {
            ChangeKind::Renamed | ChangeKind::Copied => orig.map(str::to_string),
            _ => None,
        };
        let file = ChangedFile {
            path: path.to_string(),
            orig_path,
            kind,
        };
        if list {
            status.staged.push(file);
        } else {
            status.unstaged.push(file);
        }
    }
}

/// Parsea `git status --porcelain=v2 -z --branch`.
pub fn parse_status(output: &[u8]) -> Result<RepositoryStatus, GitError> {
    let mut status = RepositoryStatus::default();
    let mut records = output.split(|byte| *byte == 0).filter(|r| !r.is_empty());

    while let Some(raw) = records.next() {
        let record = String::from_utf8_lossy(raw);
        match record.chars().next() {
            Some('#') => {
                if let Some(head) = record.strip_prefix("# branch.head ") {
                    if head == "(detached)" {
                        status.detached_head = true;
                    } else {
                        status.branch = Some(head.to_string());
                    }
                }
            }
            Some('1') => {
                let fields: Vec<&str> = record.splitn(9, ' ').collect();
                if fields.len() < 9 {
                    return Err(parse_error("entrada ordinaria", &record));
                }
                push_xy(&mut status, fields[1], fields[8], None);
            }
            Some('2') => {
                let fields: Vec<&str> = record.splitn(10, ' ').collect();
                if fields.len() < 10 {
                    return Err(parse_error("renombrado o copia", &record));
                }
                let orig = records
                    .next()
                    .map(|raw| String::from_utf8_lossy(raw).into_owned())
                    .ok_or_else(|| parse_error("ruta original ausente", &record))?;
                push_xy(&mut status, fields[1], fields[9], Some(&orig));
            }
            Some('u') => {
                let fields: Vec<&str> = record.splitn(11, ' ').collect();
                if fields.len() < 11 {
                    return Err(parse_error("conflicto", &record));
                }
                status.unstaged.push(ChangedFile {
                    path: fields[10].to_string(),
                    orig_path: None,
                    kind: ChangeKind::Conflicted,
                });
            }
            Some('?') => match record.strip_prefix("? ") {
                Some(path) => status.untracked.push(path.to_string()),
                None => return Err(parse_error("archivo sin seguimiento", &record)),
            },
            // '!' (ignorados) y cualquier otro tipo se descartan.
            _ => {}
        }
    }
    Ok(status)
}

/// Formato de `git log` que consume `parse_log`.
pub const LOG_FORMAT: &str = "--format=%H%x00%h%x00%P%x00%an%x00%aI%x00%s%x00%D%x1e";

/// Parsea la salida de `git log` con `LOG_FORMAT`.
pub fn parse_log(output: &[u8]) -> Result<Vec<CommitNode>, GitError> {
    let text = String::from_utf8_lossy(output);
    let mut commits = Vec::new();

    for record in text.split('\x1e') {
        let record = record.trim_start_matches('\n');
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split('\0').collect();
        if fields.len() != 7 {
            return Err(parse_error("commit", record));
        }
        commits.push(CommitNode {
            oid: fields[0].to_string(),
            short_oid: fields[1].to_string(),
            parents: fields[2].split_whitespace().map(str::to_string).collect(),
            author: fields[3].to_string(),
            authored_at: fields[4].to_string(),
            subject: fields[5].to_string(),
            refs: if fields[6].is_empty() {
                Vec::new()
            } else {
                fields[6].split(", ").map(str::to_string).collect()
            },
        });
    }
    Ok(commits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_branch_and_entries() {
        let out = b"# branch.oid abc\x00# branch.head main\x00\
1 .M N... 100644 100644 100644 aaa bbb src/a b.rs\x00\
1 A. N... 000000 100644 100644 000 bbb new.txt\x00\
? untracked file.txt\x00";
        let s = parse_status(out).unwrap();
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert!(!s.detached_head);
        assert_eq!(s.unstaged[0].path, "src/a b.rs");
        assert_eq!(s.unstaged[0].kind, ChangeKind::Modified);
        assert_eq!(s.staged[0].path, "new.txt");
        assert_eq!(s.staged[0].kind, ChangeKind::Added);
        assert_eq!(s.untracked, vec!["untracked file.txt"]);
    }

    #[test]
    fn parses_rename_with_original_path() {
        let out = b"2 R. N... 100644 100644 100644 aaa bbb R100 nuevo.txt\x00viejo.txt\x00";
        let s = parse_status(out).unwrap();
        assert_eq!(s.staged.len(), 1);
        assert_eq!(s.staged[0].kind, ChangeKind::Renamed);
        assert_eq!(s.staged[0].path, "nuevo.txt");
        assert_eq!(s.staged[0].orig_path.as_deref(), Some("viejo.txt"));
    }

    #[test]
    fn parses_conflict_and_detached_head() {
        let out = b"# branch.head (detached)\x00\
u UU N... 100644 100644 100644 100644 a b c conflicto.txt\x00";
        let s = parse_status(out).unwrap();
        assert!(s.detached_head);
        assert_eq!(s.branch, None);
        assert_eq!(s.unstaged[0].kind, ChangeKind::Conflicted);
    }

    #[test]
    fn keeps_newlines_in_paths() {
        let out = b"? a\nb.txt\x00";
        let s = parse_status(out).unwrap();
        assert_eq!(s.untracked, vec!["a\nb.txt"]);
    }

    #[test]
    fn rejects_truncated_record() {
        assert!(parse_status(b"1 .M N...\x00").is_err());
    }

    #[test]
    fn parses_log_records() {
        let out = "aaa\x00aaa1\x00bbb ccc\x00Ana\x002026-01-02T03:04:05+00:00\x00Merge\x00HEAD -> main, tag: v1\x1e\n\
bbb\x00bbb1\x00\x00Luis\x002026-01-01T00:00:00+00:00\x00Inicio\x00\x1e\n";
        let commits = parse_log(out.as_bytes()).unwrap();
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].parents, vec!["bbb", "ccc"]);
        assert_eq!(commits[0].refs, vec!["HEAD -> main", "tag: v1"]);
        assert!(commits[1].parents.is_empty());
        assert!(commits[1].refs.is_empty());
    }

    #[test]
    fn parses_empty_log() {
        assert!(parse_log(b"").unwrap().is_empty());
    }
}
