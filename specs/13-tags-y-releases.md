# SPEC 13 — Rama desde cualquier punto, tags y releases con tag

> **Estado:** Approved
> **Depende de:** SPEC 03, SPEC 05, SPEC 06, SPEC 12
> **Fecha:** 2026-10-19
> **Objetivo:** Permitir crear una rama desde cualquier punto del historial, crear y gestionar tags locales y remotos, y publicar una release como un tag anotado subido al remoto.

## Por qué existe esta spec

Las SPEC 05 y 12 cubren ramas y fusiones, pero el ciclo de publicación sigue obligando a usar la terminal: no se pueden crear tags, ver cuáles existen en el remoto ni marcar una versión. El workflow `release.yml` del propio proyecto ya se dispara con un tag, así que el paso que falta en la app es crear y subir ese tag.

«Release» se entiende aquí como **tag anotado + push**. Crear la release en GitHub o GitLab (notas, assets) exige APIs, tokens y un flujo de autenticación propios, y queda para otra spec.

## Alcance

**Dentro:**

- **Crear rama desde cualquier punto.** El diálogo de creación de ramas (SPEC 05) gana un selector de origen: `HEAD` (por defecto, el último commit de la rama actual), una rama local o remota, un tag, el commit seleccionado en el grafo o un campo libre (oid, `HEAD~3`) validado con `git rev-parse --verify`. Opción **Cambiar a la nueva rama** (activada por defecto).
- **Acción «Crear rama aquí»** y **«Crear tag aquí»** sobre el commit seleccionado en el grafo.
- **Listar tags locales** en la barra lateral: nombre, tipo (ligero o anotado), commit al que apuntan, fecha y mensaje; ordenados por versión descendente.
- **Crear tag** local, ligero o anotado (con mensaje), en `HEAD` o en cualquier punto válido. Validación del nombre con `git check-ref-format`.
- **Eliminar tag local** con confirmación.
- **Ver tags remotos** con `git ls-remote --tags` sin descargarlos, marcando cuáles faltan en local y cuáles solo existen en local.
- **Traer tags** del remoto (`git fetch --tags`) con progreso y cancelación (SPEC 06).
- **Publicar un tag** concreto al remoto (`git push <remoto> refs/tags/<tag>`), nunca `--tags` en bloque.
- **Eliminar un tag remoto** (`git push <remoto> :refs/tags/<tag>`) con confirmación fuerte: hay que escribir el nombre del tag.
- **Asistente «Nueva release»:** pide versión (con sugerencia a partir del último tag semántico: parche, menor, mayor), mensaje y commit (por defecto `HEAD`); muestra los commits incluidos desde el tag anterior como notas de ayuda; crea el tag anotado y ofrece subirlo en el mismo flujo. Avisa si la rama no está sincronizada con su upstream.
- Errores con contexto y detalle técnico, teclado completo, colores solo desde tokens y contraste AA (SPEC 08).

**Fuera de alcance (para specs futuras):**

- Crear la release en GitHub, GitLab u otro proveedor (API, tokens, assets).
- Generar un changelog en archivo o editar `CHANGELOG.md` / `package.json` / `Cargo.toml` para subir la versión.
- Tags firmados (GPG/SSH).
- Mover un tag existente (`-f`) y push forzado.
- Checkout de un tag como HEAD desacoplado.
- Elegir varios remotos a la vez: se usa el remoto indicado (por defecto `origin`).
- Un atajo de teclado global dedicado.

## Modelo de datos

```ts
type TagInfo = {
  name: string;                  // "v1.2.0"
  kind: "lightweight" | "annotated";
  targetOid: string;             // commit al que apunta (pelado)
  tagOid: string | null;         // objeto tag; null si es ligero
  message: string | null;        // solo anotados
  taggerDate: string | null;     // ISO 8601; en ligeros, fecha del commit
  existsLocal: boolean;
  existsRemote: boolean | null;  // null si no se ha consultado el remoto
};

type RemoteTag = { name: string; targetOid: string };

type StartPoint =
  | { kind: "head" }
  | { kind: "branch"; name: string }   // local o remota
  | { kind: "tag"; name: string }
  | { kind: "commit"; oid: string }
  | { kind: "ref"; expression: string }; // validada con rev-parse

type ReleaseSuggestion = {
  lastTag: string | null;
  patch: string | null;
  minor: string | null;
  major: string | null;
  commitsSinceLastTag: { oid: string; subject: string }[];
  behindUpstream: number;
};
```

Convenciones:

- Comandos nuevos: `list_tags(repositoryId)`, `list_remote_tags(repositoryId, remote)`, `create_tag(repositoryId, name, target, message | null)`, `delete_tag(repositoryId, name)`, `fetch_tags(repositoryId, remote)`, `push_tag(repositoryId, remote, name)`, `delete_remote_tag(repositoryId, remote, name)`, `release_suggestion(repositoryId)`.
- `create_branch` (SPEC 05) mantiene su firma; el frontend traduce `StartPoint` a la cadena `startPoint` que ya recibe, tras validarla con un comando `resolve_ref(repositoryId, expression)` que devuelve el oid o un error claro. Si no se pasa origen, se usa `HEAD`.
- Un tag con mensaje es anotado (`git tag -a -m`); sin mensaje, ligero. La app propone anotado para releases.
- Los nombres de tag se validan con `git check-ref-format "refs/tags/<nombre>"` y nunca pueden empezar por `-`. Se pasan tras `--` cuando aplique.
- `list_tags` usa `git for-each-ref --format=... refs/tags` con separadores NUL y `--sort=-version:refname`.
- Los comandos de red (`list_remote_tags`, `fetch_tags`, `push_tag`, `delete_remote_tag`) reutilizan `SyncContext` de la SPEC 06: progreso, cancelación, `GIT_TERMINAL_PROMPT=0` y clasificación de errores. Las URLs mostradas se sanean.
- `push_tag` rechaza (sin forzar) si el tag ya existe en el remoto apuntando a otro commit; el error se clasifica y se explica.
- Sugerencia de versión: solo si el último tag coincide con `vMAJOR.MINOR.PATCH` (prefijo `v` opcional); si no, `null` y el usuario escribe el nombre.
- Este spec no añade campos a `settings.json`.

## Plan de implementación

1. Crear `git/tags.rs` con `list_tags`, `create_tag` y `delete_tag`. Pruebas contra Git real: ligero, anotado, nombre inválido, nombre duplicado, tag en un commit antiguo, orden por versión, repositorio sin tags.
2. Añadir `resolve_ref` y la sugerencia de versión (`release_suggestion`). Pruebas: `HEAD~1`, oid corto, rama remota, expresión inválida, último tag no semántico, sin tags previos.
3. Ampliar `git/sync.rs` con `list_remote_tags`, `fetch_tags`, `push_tag` y `delete_remote_tag`. Pruebas contra un remoto bare `file://`: tag nuevo, tag ya existente apuntando a otro commit, borrado remoto, tag inexistente, remoto inalcanzable.
4. Exponer los comandos en `commands/` y `lib.rs`, tipos en `types/git.ts` y llamadas en `lib/api.ts`. Pruebas de que los fallos llegan como `AppError`.
5. Ampliar `CreateBranchDialog` con el selector de origen y la opción de cambiar a la rama. Añadir **Crear rama aquí** en el grafo. Pruebas de componente.
6. Crear `features/tags`: sección de tags en la barra lateral (local y remoto, con indicadores de sincronía), diálogo de creación, eliminación local y **Crear tag aquí** en el grafo. Pruebas de componente.
7. Crear los flujos de red: traer tags, publicar tag y eliminar tag remoto (con confirmación escribiendo el nombre), con progreso y errores con detalle.
8. Crear el asistente **Nueva release**: versión sugerida, mensaje, commits incluidos, aviso de rama desincronizada, creación del tag anotado y subida opcional. Prueba del recorrido completo.
9. Refrescar grafo, tags y ramas tras cada operación; revisión visual manual en tema claro y oscuro; actualizar `docs/shortcuts.md` y `CHANGELOG.md`.

## Criterios de aceptación

- [ ] Se puede crear una rama desde `HEAD`, otra rama local o remota, un tag, el commit seleccionado en el grafo y una expresión libre válida; una expresión inválida muestra el motivo y no ejecuta nada.
- [ ] Con **Cambiar a la nueva rama** activada, la rama queda como actual tras crearla; desactivada, no cambia.
- [ ] La lista de tags locales coincide con `git tag -l` y distingue ligeros de anotados.
- [ ] Crear un tag anotado deja el mismo objeto que `git tag -a -m` en la CLI; un nombre inválido o duplicado muestra el motivo.
- [ ] Eliminar un tag local pide confirmación y deja `git tag -l` sin él.
- [ ] La vista de tags remotos coincide con `git ls-remote --tags` sin descargar objetos, y marca los que faltan en local o en remoto.
- [ ] **Traer tags** descarga los tags faltantes con progreso y se puede cancelar.
- [ ] **Publicar tag** sube solo el tag elegido; si el remoto ya tiene ese nombre en otro commit, falla con un mensaje claro y no lo sobrescribe.
- [ ] **Eliminar tag remoto** exige escribir el nombre del tag y lo elimina del remoto sin tocar el local.
- [ ] **Nueva release** sugiere parche, menor y mayor a partir del último tag semántico, muestra los commits incluidos, avisa si la rama va detrás de su upstream, crea el tag anotado y puede subirlo.
- [ ] Tras cada operación se actualizan el grafo, la lista de tags y la de ramas.
- [ ] Un fallo de red o de Git se muestra con contexto y detalle técnico, sin credenciales en las URLs.
- [ ] Todo es operable con teclado y los colores nuevos salen de los tokens y cumplen contraste AA en ambos temas.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** «release» = tag anotado + push. Cubre el disparador de `release.yml` sin APIs de proveedor ni tokens. Crear la release en GitHub/GitLab queda para otra spec.
- **Sí:** origen de rama por defecto `HEAD` (último commit de la rama actual) y selector para ramas, tags, commit del grafo o expresión libre. Cubre los casos habituales (feature desde `origin/develop`, hotfix desde un tag) sin obligar a copiar oids.
- **Sí:** **Cambiar a la nueva rama** activada por defecto. Es lo que espera quien crea una rama para trabajar en ella; se puede desmarcar.
- **Sí:** reutilizar `create_branch` y validar el origen con `resolve_ref`. Evita duplicar la lógica de la SPEC 05.
- **Sí:** tags anotados como opción recomendada para releases y ligeros disponibles para marcas rápidas. Los anotados guardan autor, fecha y mensaje, y son los que `git describe` usa por defecto.
- **Sí:** publicar siempre un tag concreto, nunca `--tags`. Evita subir por accidente tags locales de prueba.
- **Sí:** `ls-remote --tags` para ver los remotos. No descarga nada y no altera el repositorio; `fetch --tags` es una acción aparte y explícita.
- **Sí:** permitir borrar tags remotos con confirmación escribiendo el nombre. Es destructivo para otras personas, y a diferencia del borrado de ramas remotas (descartado en la SPEC 05) aquí el usuario lo pidió expresamente; la barrera es la confirmación fuerte.
- **No:** mover tags existentes ni push forzado. Reescribir un tag publicado rompe a quien ya lo descargó.
- **No:** tags firmados. Exigen configuración de claves que la app todavía no gestiona.
- **No:** editar archivos de versión ni `CHANGELOG.md` al hacer una release. Tocar el working tree desde un asistente de tags mezcla responsabilidades; entra, si llega, en su propia spec.
- **No:** un atajo de teclado dedicado, por la misma razón que en las SPEC 10, 11 y 12.
- **Sí:** sin campos nuevos en `settings.json`. Nada que persistir más allá de Git.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Borrar un tag remoto por error afecta a otras personas y a pipelines | Confirmación escribiendo el nombre; el modal muestra remoto, tag y commit al que apunta. |
| Publicar una release desde una rama desincronizada o con commits sin subir | El asistente muestra cuántos commits va detrás/delante de su upstream y avisa antes de crear el tag. |
| El tag ya existe en el remoto con otro commit | `push_tag` no fuerza; el error se clasifica y explica cómo resolverlo. |
| Expresiones libres como origen que Git interpreta como opciones | Validar con `rev-parse --verify`, pasar tras `--` y rechazar valores que empiecen por `-`. |
| Repositorios con miles de tags hacen lenta la lista | Carga con un solo `for-each-ref`, filtrado instantáneo en el cliente y consulta al remoto bajo demanda. |
| `ls-remote` y `push` sin credenciales o sin red | Mismos errores clasificados de la SPEC 06; la vista local sigue funcionando y `existsRemote` queda en `null`. |
| Sugerencia de versión errónea con esquemas no semánticos | Solo se sugiere si el último tag es `vX.Y.Z`; en otro caso se deja el campo libre. |

## Lo que **no** está en esta spec

- Release de proveedor (GitHub/GitLab), assets y notas publicadas.
- Subida automática de versión en archivos del proyecto y generación de `CHANGELOG.md`.
- Tags firmados, mover tags, push forzado y checkout de un tag.
- Gestión de remotos (añadir, quitar, editar) y atajos de teclado globales.

Cada uno entra, si llega, en su propia spec.
