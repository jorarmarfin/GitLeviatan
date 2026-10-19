# SPEC 04 — Stage, diff y commit

> **Estado:** Borrador
> **Depende de:** SPEC 02
> **Fecha:** 2026-10-19
> **Objetivo:** Permitir hacer stage y unstage por archivo, ver el diff de archivos de texto en un visor Monaco y crear commits mostrando errores de validación y de hooks.

## Por qué existe esta spec

Es la primera mitad de la Fase 3. Introduce la primera operación que modifica el repositorio, así que fija las reglas de seguridad de escritura (rutas literales, entrada estándar para mensajes, errores de hooks).

## Alcance

**Dentro:**

- Comandos `stage_files`, `unstage_files`, `get_diff` y `create_commit`.
- Panel de cambios inferior con listas staged/unstaged/untracked y acciones por archivo.
- Visor de diff con Monaco `DiffEditor` para archivos de texto.
- Campo de mensaje de commit y botón Commit, deshabilitado sin mensaje o sin cambios staged.
- Mostrar el error completo de Git o de un hook cuando el commit falla.
- Refresco del estado y del historial tras cada operación.
- Detección de binarios y de archivos grandes (mensaje en lugar de diff).

**Fuera de alcance (para specs futuras):**

- Stage y unstage por fragmento (hunk) o por línea.
- Diff de commits históricos y lista de archivos por commit.
- Amend, firma de commits y plantillas de mensaje.
- Descartar cambios del working tree (operación destructiva; spec propia).
- Resolución de conflictos.
- Stash, reset, revert y cherry-pick.

## Modelo de datos

```ts
type DiffScope = "staged" | "unstaged";

type FileDiff = {
  path: string;
  original: string;      // contenido en HEAD (staged) o en el índice (unstaged)
  modified: string;      // contenido en el índice (staged) o en el working tree (unstaged)
  isBinary: boolean;
  tooLarge: boolean;     // > 1 MiB: no se envía el contenido
};

type CommitResult = { oid: string; shortOid: string };
```

Convenciones:

- Comandos: `stage_files(repositoryId, paths)`, `unstage_files(repositoryId, paths)`, `get_diff(repositoryId, path, scope)`, `create_commit(repositoryId, message)`.
- Rutas pasadas tras `--` y con `--literal-pathspecs`.
- El mensaje de commit viaja por stdin (`git commit -F -`), nunca como argumento de shell.
- Para unstage en un repositorio sin commits se usa `git rm --cached`; en los demás, `git restore --staged`.
- Los errores se devuelven con stderr de Git sin credenciales.

## Plan de implementación

1. Añadir `stage_files` y `unstage_files` en `git/operations.rs`. Pruebas de integración, incluido repositorio sin commits y nombres especiales.
2. Añadir botones stage/unstage por archivo en `features/status`. Verificación: coincide con `git status`.
3. Implementar `get_diff` con detección de binarios y límite de 1 MiB. Pruebas con archivo nuevo, eliminado y renombrado.
4. Instalar `@monaco-editor/react` con carga local (sin CDN) y crear `features/diffs/DiffViewer.tsx`. Verificación: abre al seleccionar un archivo.
5. Implementar `create_commit` por stdin y mapear errores de validación y de hook. Prueba con hook `pre-commit` que falla.
6. Crear el panel de commit: mensaje, botón, estado de operación en curso y error con "ver detalle técnico".
7. Refrescar estado e historial tras cada operación con éxito.
8. Ajustar la CSP y los workers de Monaco para que funcionen sin red. Verificación: no hay peticiones externas.

## Criterios de aceptación

- [ ] Stage → commit deja el repositorio igual que `git add` + `git commit` en la CLI (mismo `git status` y `git log`).
- [ ] Unstage devuelve un archivo staged a unstaged, también en un repositorio sin commits.
- [ ] Un archivo con espacios, Unicode o salto de línea en el nombre se puede stagear y commitear.
- [ ] El diff de un archivo de texto modificado muestra original y modificado en el visor.
- [ ] Un archivo binario o de más de 1 MiB muestra un aviso y no intenta renderizar el diff.
- [ ] El botón Commit está deshabilitado sin mensaje o sin cambios staged.
- [ ] Si un hook `pre-commit` falla, se muestra su salida y no se crea el commit.
- [ ] Un mensaje con caracteres de shell (`$(...)`, comillas, backticks) se guarda literalmente.
- [ ] Monaco carga sin peticiones de red.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** Monaco para el diff (decisión del documento de producto).
- **No:** un visor de diff propio. Más trabajo sin beneficio.
- **Sí:** `get_diff` devuelve texto original y modificado. Es lo que necesita el `DiffEditor`.
- **No:** parsear salida unified diff en esta spec. Se necesitará para hunks; entonces se añade.
- **Sí:** mensaje por stdin. Evita problemas de escape y de longitud de argumentos.
- **Sí:** límite de 1 MiB para diff. Protege la memoria y la UI.
- **No:** descartar cambios. Es destructivo y merece confirmaciones y pruebas propias.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Monaco pesado en el bundle | Carga diferida (`lazy`) solo al abrir un diff. |
| Workers de Monaco bloqueados por la CSP | Paso 8 con prueba manual; documentar la CSP resultante. |
| Hooks lentos congelan la UI | Operación asíncrona con estado "en curso"; sin cancelación en esta spec. |
| Identidad Git no configurada (`user.name`/`user.email`) | Mostrar el error de Git con instrucciones; no escribir la config automáticamente. |

## Lo que **no** está en esta spec

- Hunks, descartar cambios, amend, firma, stash y conflictos.
- Diff de commits históricos.
- Ramas, remotos y sincronización.

Cada uno entra, si llega, en su propia spec.
