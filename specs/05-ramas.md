# SPEC 05 — Ramas locales y ramas de seguimiento

> **Estado:** Approved
> **Depende de:** SPEC 02, SPEC 04
> **Fecha:** 2026-10-19
> **Objetivo:** Listar ramas locales y de seguimiento, y permitir crear, cambiar y eliminar ramas locales con confirmaciones de seguridad.

## Por qué existe esta spec

Es la segunda mitad de la Fase 3. Cambiar y borrar ramas puede perder trabajo, por lo que las confirmaciones y los mensajes de error son parte central del alcance.

## Alcance

**Dentro:**

- Sidebar de ramas: locales, remotas (de seguimiento), rama actual y upstream con adelanto/atraso.
- `create_branch` desde HEAD o desde un commit seleccionado.
- `checkout_branch` para ramas locales y para ramas remotas (crea la local con seguimiento).
- `delete_branch` con confirmación; segunda confirmación si la rama no está fusionada.
- Validación de nombres con `git check-ref-format --branch`.
- No permitir eliminar la rama actual.
- Mostrar el error de Git si el cambio de rama falla por cambios locales.

**Fuera de alcance (para specs futuras):**

- Renombrar ramas, merge, rebase y reset.
- Stash automático al cambiar de rama.
- Eliminar ramas remotas.
- Detached HEAD por checkout de un commit o tag.
- Listar y gestionar remotos (SPEC 06).

## Modelo de datos

```ts
type BranchInfo = {
  name: string;               // "main" o "origin/main"
  kind: "local" | "remote";
  isCurrent: boolean;
  upstream: string | null;    // solo ramas locales
  ahead: number;
  behind: number;
  tipOid: string;
};

type DeleteBranchOutcome =
  | { status: "deleted" }
  | { status: "needsForce"; reason: "notMerged" };
```

Convenciones:

- Comandos: `list_branches(repositoryId)`, `create_branch(repositoryId, name, startPoint)`, `checkout_branch(repositoryId, branch)`, `delete_branch(repositoryId, branch, force)`.
- Listado con `git for-each-ref --format=... refs/heads refs/remotes` y separadores NUL.
- Se usa `git switch` (con `--track` para ramas remotas) y `git branch -d` / `-D`.
- No se asume que la rama principal se llame `main`.

## Plan de implementación

1. Implementar `list_branches` con parseo y pruebas (upstream, ahead/behind, sin upstream, detached HEAD).
2. Crear `features/branches` con la lista en la sidebar. Verificación: coincide con `git branch -a`.
3. Implementar `create_branch` con validación de nombre y diálogo de creación.
4. Implementar `checkout_branch` y mostrar el error de Git cuando hay cambios que lo impiden. Pruebas con árbol sucio y limpio.
5. Soportar checkout de rama remota creando la local con seguimiento.
6. Implementar `delete_branch`: `-d` primero; si falla por no fusionada, devolver `needsForce`. Pruebas de ambos caminos.
7. Añadir diálogos de confirmación (eliminar y forzar) con explicación de qué commits se perderían.
8. Refrescar estado, historial y lista de ramas tras cada operación.

## Criterios de aceptación

- [ ] La lista de ramas locales y remotas coincide con `git branch -a` en el repositorio de prueba.
- [ ] La rama actual aparece marcada y, en detached HEAD, ninguna rama aparece como actual.
- [ ] Se muestra ahead/behind correcto para una rama con upstream.
- [ ] Crear una rama con nombre inválido muestra el motivo y no ejecuta nada.
- [ ] Cambiar de rama con cambios locales conflictivos muestra el error de Git y no cambia de rama.
- [ ] Hacer checkout de `origin/feature` crea `feature` con seguimiento.
- [ ] Eliminar una rama fusionada pide una confirmación.
- [ ] Eliminar una rama no fusionada pide una segunda confirmación que indica el riesgo.
- [ ] No se puede eliminar la rama actual (el botón está deshabilitado o el comando rechaza).
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** `git switch` en lugar de `git checkout`. Semántica más clara para cambiar de rama.
- **No:** stash automático. Oculta efectos sobre cambios sin confirmar; el documento exige explicarlos.
- **Sí:** dos niveles de confirmación al eliminar. Cumple "confirmación para eliminar ramas con cambios no fusionados".
- **Sí:** validar con `git check-ref-format`. La definición de nombre válido es la de Git.
- **No:** eliminar ramas remotas. Es una operación de red con efectos para otras personas.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Pérdida de commits al forzar el borrado | Mostrar el oid de la punta y recordar que sigue en el reflog. |
| Nombres de rama con caracteres especiales | Pasarlos siempre como argumentos estructurados, tras `--` cuando aplique. |
| Datos de ahead/behind desactualizados sin fetch | Indicar en la UI que depende del último fetch. |

## Lo que **no** está en esta spec

- Merge, rebase, reset, renombrar ramas, borrar ramas remotas.
- Gestión de remotos y sincronización.

Cada uno entra, si llega, en su propia spec.
