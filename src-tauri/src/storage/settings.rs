//! Preferencias locales en `settings.json` (versionado, escritura atómica).
//!
//! Migraciones de esquema: `version` es 1. Un cambio futuro debe subir `VERSION` y
//! convertir aquí el formato anterior; mientras tanto, un archivo de otra versión se
//! respalda en `settings.json.bak` y se recrea con valores por defecto.

use std::fs;
use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::git::error::AppError;
use crate::git::process::check_git;

pub const VERSION: u32 = 1;
pub const MIN_RECENT: u32 = 5;
pub const MAX_RECENT: u32 = 50;
pub const DEFAULT_RECENT: u32 = 20;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub theme: Theme,
    /// `None` = buscar `git` en el `PATH`.
    pub git_path: Option<String>,
    pub max_recent_repositories: u32,
    /// Abrir al iniciar el último proyecto que estaba abierto. Opcional en el archivo (SPEC 12):
    /// un `settings.json` de la SPEC 07 sin este campo sigue siendo válido.
    #[serde(default = "default_reopen")]
    pub reopen_last_repository: bool,
    /// Ruta del último proyecto abierto; `None` si se cerró con «Cerrar repositorio».
    #[serde(default)]
    pub last_repository_path: Option<String>,
}

fn default_reopen() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: VERSION,
            theme: Theme::System,
            git_path: None,
            max_recent_repositories: DEFAULT_RECENT,
            reopen_last_repository: true,
            last_repository_path: None,
        }
    }
}

fn range_error() -> AppError {
    AppError::invalid_input(format!(
        "El número de repositorios recientes debe estar entre {MIN_RECENT} y {MAX_RECENT}."
    ))
}

impl Settings {
    /// Valida rangos y, si hay ruta de Git, comprueba que responde a `--version`.
    /// Devuelve los ajustes normalizados (ruta recortada; vacía = `None`).
    pub fn validated(mut self) -> Result<Self, AppError> {
        if self.version != VERSION {
            return Err(AppError::invalid_input(
                "Versión de preferencias no soportada.",
            ));
        }
        if !(MIN_RECENT..=MAX_RECENT).contains(&self.max_recent_repositories) {
            return Err(range_error());
        }
        self.git_path = self
            .git_path
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty());
        if let Some(path) = &self.git_path {
            check_git(Some(std::path::Path::new(path)))?;
        }
        Ok(self)
    }

    /// Comprobación sin ejecutar Git: se usa al leer el archivo del disco.
    fn is_sane(&self) -> bool {
        self.version == VERSION && (MIN_RECENT..=MAX_RECENT).contains(&self.max_recent_repositories)
    }
}

pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Lee las preferencias. Un archivo ilegible, de otra versión o con valores fuera de
    /// rango se renombra a `settings.json.bak` y se recrea con los valores por defecto.
    pub fn load(&self) -> Settings {
        let text = match fs::read_to_string(&self.path) {
            Ok(text) => text,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Settings::default(),
            Err(_) => return self.recover(),
        };
        match serde_json::from_str::<Settings>(&text) {
            Ok(settings) if settings.is_sane() => settings,
            _ => self.recover(),
        }
    }

    fn recover(&self) -> Settings {
        let backup = self.path.with_extension("json.bak");
        if let Err(error) = fs::rename(&self.path, &backup) {
            eprintln!("no se pudo respaldar settings.json: {error}");
        }
        let defaults = Settings::default();
        if let Err(error) = self.save(&defaults) {
            eprintln!("no se pudo recrear settings.json: {error}");
        }
        defaults
    }

    pub fn save(&self, settings: &Settings) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(settings).map_err(io::Error::other)?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::error::AppErrorKind;

    fn store() -> (tempfile::TempDir, SettingsStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = SettingsStore::new(dir.path().join("cfg").join("settings.json"));
        (dir, store)
    }

    #[test]
    fn missing_file_gives_defaults() {
        let (_dir, store) = store();
        assert_eq!(store.load(), Settings::default());
    }

    #[test]
    fn defaults_match_the_documented_file() {
        let json = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "version":1,"theme":"system","gitPath":null,"maxRecentRepositories":20,
                "reopenLastRepository":true,"lastRepositoryPath":null
            })
        );
    }

    #[test]
    fn save_then_load_roundtrips() {
        let (_dir, store) = store();
        let settings = Settings {
            theme: Theme::Dark,
            git_path: Some("/usr/bin/git".into()),
            max_recent_repositories: 7,
            ..Settings::default()
        };
        store.save(&settings).unwrap();
        assert_eq!(store.load(), settings);
        assert!(!store.path.with_extension("json.tmp").exists());
    }

    fn assert_recovers(content: &str) {
        let (_dir, store) = store();
        fs::create_dir_all(store.path.parent().unwrap()).unwrap();
        fs::write(&store.path, content).unwrap();

        assert_eq!(store.load(), Settings::default());
        let backup = store.path.with_extension("json.bak");
        assert_eq!(fs::read_to_string(backup).unwrap(), content);
        // El archivo vuelve a ser válido con los valores por defecto.
        assert_eq!(store.load(), Settings::default());
    }

    #[test]
    fn corrupt_file_is_backed_up() {
        assert_recovers("{ esto no es json");
    }

    #[test]
    fn other_version_is_backed_up() {
        assert_recovers(
            r#"{"version":99,"theme":"dark","gitPath":null,"maxRecentRepositories":20}"#,
        );
    }

    #[test]
    fn out_of_range_values_are_backed_up() {
        assert_recovers(
            r#"{"version":1,"theme":"dark","gitPath":null,"maxRecentRepositories":999}"#,
        );
    }

    #[test]
    fn unknown_theme_is_backed_up() {
        assert_recovers(
            r#"{"version":1,"theme":"neon","gitPath":null,"maxRecentRepositories":20}"#,
        );
    }

    #[test]
    fn rejects_recent_limit_outside_range() {
        for bad in [0, 4, 51, 1000] {
            let err = Settings {
                max_recent_repositories: bad,
                ..Settings::default()
            }
            .validated()
            .unwrap_err();
            assert_eq!(err.kind, AppErrorKind::Validation, "{bad}");
        }
        for good in [5, 20, 50] {
            Settings {
                max_recent_repositories: good,
                ..Settings::default()
            }
            .validated()
            .unwrap();
        }
    }

    #[test]
    fn rejects_fake_git_path() {
        let err = Settings {
            git_path: Some("/no/existe/git".into()),
            ..Settings::default()
        }
        .validated()
        .unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Git);
    }

    #[test]
    fn rejects_a_binary_that_is_not_git() {
        // `true` existe en cualquier unix y termina bien, pero no dice «git version».
        let Some(path) = crate::git::process::find_in_path("true") else {
            return;
        };
        let err = Settings {
            git_path: Some(path.to_string_lossy().into_owned()),
            ..Settings::default()
        }
        .validated()
        .unwrap_err();
        assert_eq!(err.kind, AppErrorKind::Validation);
    }

    #[test]
    fn accepts_real_git_path_and_normalizes_blank() {
        let real = crate::git::process::find_in_path("git").expect("git en el PATH");
        let ok = Settings {
            git_path: Some(format!("  {}  ", real.display())),
            ..Settings::default()
        }
        .validated()
        .unwrap();
        assert_eq!(ok.git_path.as_deref(), Some(real.to_str().unwrap()));

        let blank = Settings {
            git_path: Some("   ".into()),
            ..Settings::default()
        }
        .validated()
        .unwrap();
        assert_eq!(blank.git_path, None);
    }

    // --- campos de la SPEC 12 ---

    #[test]
    fn a_spec_07_file_without_the_new_fields_loads_without_backup() {
        let (_dir, store) = store();
        fs::create_dir_all(store.path.parent().unwrap()).unwrap();
        fs::write(
            &store.path,
            r#"{"version":1,"theme":"dark","gitPath":null,"maxRecentRepositories":12}"#,
        )
        .unwrap();

        let loaded = store.load();
        assert_eq!(loaded.theme, Theme::Dark);
        assert_eq!(loaded.max_recent_repositories, 12);
        assert!(
            loaded.reopen_last_repository,
            "por defecto se reabre el último proyecto"
        );
        assert_eq!(loaded.last_repository_path, None);
        // No se respaldó ni se recreó: el archivo original sigue intacto.
        assert!(!store.path.with_extension("json.bak").exists());
        assert!(fs::read_to_string(&store.path)
            .unwrap()
            .contains("\"theme\":\"dark\""));
    }

    #[test]
    fn the_new_fields_roundtrip() {
        let (_dir, store) = store();
        let settings = Settings {
            reopen_last_repository: false,
            last_repository_path: Some("/home/ana/proyecto".into()),
            ..Settings::default()
        };
        store.save(&settings).unwrap();
        assert_eq!(store.load(), settings);
    }

    #[test]
    fn the_new_fields_do_not_affect_validation() {
        let ok = Settings {
            reopen_last_repository: false,
            last_repository_path: Some("/no/existe".into()),
            ..Settings::default()
        }
        .validated()
        .unwrap();
        assert!(!ok.reopen_last_repository);
        assert_eq!(ok.last_repository_path.as_deref(), Some("/no/existe"));
    }
}
