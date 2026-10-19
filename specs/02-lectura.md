# SPEC 02 — Lectura: abrir repositorio, estado e historial

> **Estado:** Implemented
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-19
> **Objetivo:** Permitir abrir un repositorio local, recordar los recientes y mostrar su estado de cambios y su historial de commits en una lista paginada, leyendo todo con el Git CLI instalado.

## Por qué existe esta spec

Es la Fase 1 del plan. Define el servicio Git de Rust (`git/process.rs`, `git/parse.rs`, `git/repository.rs`) y los tipos compartidos con TypeScript. Todas las specs siguientes se apoyan en estos contratos.

## Alcance

**Dentro:**

- Abrir un repositorio con el selector de carpetas del sistema (`tauri-plugin-dialog`).
- Validar la ruta con `git rev-parse --show-toplevel` y rechazar rutas que no sean repositorios.
- Lista de repositorios recientes (máximo 20) persistida en `recent.json` dentro del directorio de configuración de la app.
- `get_status`: staged, unstaged, untracked, rama actual y detached HEAD, usando `git status --porcelain=v2 -z --branch`.
- `list_commits`: historial paginado con autor, fecha, hash corto, asunto y referencias.
- Estados de UI: carga, repositorio vacío (sin commits), error recuperable.
- Ejecución de Git con argumentos estructurados (nunca shell), `current_dir` validado y `--literal-pathspecs`.
- Pruebas de integración con repositorios temporales (nombres con espacios, Unicode y saltos de línea).

**Fuera de alcance (para specs futuras):**

- Gráfico de ramas y merges (SPEC 03).
- Stage, unstage, diff y commit (SPEC 04).
- Ramas (SPEC 05), remotos (SPEC 06) y ajustes de Git (SPEC 07).
- Repositorios bare: se rechazan con un mensaje claro.
- Filtros y búsqueda en el historial.

## Modelo de datos

```ts
// src/types/git.ts (espejo de las structs Rust con serde, camelCase)
type RepositoryRef = { id: string; path: string; name: string };

type ChangeKind =
  | "added" | "modified" | "deleted" | "renamed" | "copied" | "typechange" | "conflicted";

type ChangedFile = { path: string; origPath: string | null; kind: ChangeKind };

type RepositoryStatus = {
  branch: string | null;
  detachedHead: boolean;
  staged: ChangedFile[];
  unstaged: ChangedFile[];
  untracked: string[];
};

type CommitNode = {
  oid: string;
  shortOid: string;
  parents: string[];
  author: string;
  authoredAt: string; // ISO 8601
  subject: string;
  refs: string[];
};

type CommitPage = { commits: CommitNode[]; nextCursor: string | null };

type RecentRepository = { path: string; name: string; lastOpenedAt: string };
```

```jsonc
// <config_dir>/recent.json
{ "version": 1, "repositories": [/* RecentRepository, más reciente primero */] }
```

Convenciones:

- `repositoryId` lo asigna el backend al abrir y vive en un `Mutex<HashMap>` en el estado de Tauri.
- `cursor` es un desplazamiento numérico en texto (`--skip`).
- Comandos: `open_repository(path)`, `list_recent_repositories()`, `get_status(repositoryId)`, `list_commits(repositoryId, cursor, limit)`.

## Plan de implementación

1. Crear `git/process.rs` con una función que ejecuta Git con `Command`, `current_dir`, captura stdout/stderr y devuelve un error tipado. Prueba Rust: `git --version`.
2. Crear `git/repository.rs` con validación de ruta y registro de `repositoryId`. Comando `open_repository`. Prueba con repo temporal y con carpeta no Git.
3. Crear `git/parse.rs` con el parseo de `status --porcelain=v2 -z`. Pruebas con renombrados, conflictos y nombres con saltos de línea.
4. Comando `get_status`. Prueba de integración contra un repo temporal.
5. Añadir en `git/parse.rs` el parseo de `git log --format=%H%x00%P%x00%an%x00%aI%x00%s%x00%D%x1e` y el comando `list_commits` con paginación. Prueba con repo vacío y con 120 commits.
6. Crear `storage/` con lectura y escritura atómica de `recent.json`. Comando `list_recent_repositories` y registro al abrir. Prueba con archivo corrupto (se ignora y se recrea).
7. Añadir `tauri-plugin-dialog` y el permiso `dialog:allow-open` en `capabilities/`. Verificación: el selector se abre.
8. Crear `src/types/git.ts` y `src/lib/api.ts` (wrappers tipados de `invoke`).
9. Crear `features/repositories` (botón Abrir, lista de recientes) y mostrar el repositorio activo en la barra superior.
10. Crear `features/status` (lista staged/unstaged/untracked, solo lectura) y `features/commits` (lista paginada con "cargar más"). Verificación manual contra un repo real.

## Criterios de aceptación

- [ ] Abrir una carpeta que no es repositorio muestra un error legible y no cambia el repositorio activo.
- [ ] Abrir un repositorio privado existente funciona sin pedir cuenta de GitLeviatán.
- [ ] La lista de cambios coincide con `git status` en los escenarios de prueba (añadido, modificado, eliminado, renombrado, conflicto, untracked).
- [ ] Un archivo con espacios, Unicode o un salto de línea en el nombre se muestra completo y correcto.
- [ ] Un repositorio sin commits muestra el estado "repositorio vacío" y no un error.
- [ ] En detached HEAD, `detachedHead` es `true` y `branch` es `null`.
- [ ] El historial muestra autor, fecha, hash corto y asunto, y carga 100 commits por página.
- [ ] Tras reiniciar la app, el repositorio abierto aparece en recientes (máximo 20, sin duplicados).
- [ ] Un `recent.json` corrupto no impide arrancar.
- [ ] La UI sigue respondiendo mientras se carga el historial de un repositorio de más de 10 000 commits.
- [ ] `cargo test`, `cargo clippy -- -D warnings`, `pnpm lint` y `pnpm test` terminan con código 0.

## Decisiones

- **Sí:** Git CLI con `std::process::Command`. Fidelidad exacta al comportamiento de Git (decisión del documento de producto).
- **No:** libgit2/gitoxide. Divergencias de comportamiento y más superficie.
- **Sí:** `status --porcelain=v2 -z --branch`. Formato estable y apto para parseo, con información de rama.
- **No:** `--porcelain=v1`. El documento lo menciona, pero v2 distingue mejor renombrados y conflictos.
- **Sí:** `recent.json` versionado en el directorio de configuración. Cumple "archivo local; SQLite solo si se justifica".
- **No:** SQLite. Complejidad sin necesidad aún.
- **Sí:** `cursor` como desplazamiento. Simple; suficiente con orden estable.
- **No:** rechazar solo en la UI las rutas inválidas. La validación vive en Rust.
- **Sí:** repositorios bare rechazados con mensaje. El documento pide "contemplar" bare; aquí se contempla rechazándolos explícitamente.
- **Sí:** definición rápida sin aclaración detallada. Esta spec se escribió sin ronda de preguntas a petición del usuario; los supuestos deben revisarse al aprobarla.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| `--skip` degrada en historiales enormes | Medir en el prototipo del grafo (SPEC 03); migrar a cursor por oid si hace falta. |
| Repositorios con `safe.directory` o ownership distinto | Mostrar el error de Git tal cual con una explicación breve. |
| Hooks o config maliciosa del repo ejecutando código al abrirlo | Los comandos de lectura no ejecutan hooks; documentado en `SECURITY.md`. |
| Idioma de los mensajes de Git | Forzar `LC_ALL=C` al ejecutar para parsear errores de forma fiable. |

## Lo que **no** está en esta spec

- Grafo de commits, stage/unstage, diff, commit, ramas, fetch/pull/push, clone.
- Preferencias persistentes de la app y ubicación personalizada de Git.
- Repositorios bare, submódulos y worktrees.

Cada uno entra, si llega, en su propia spec.
