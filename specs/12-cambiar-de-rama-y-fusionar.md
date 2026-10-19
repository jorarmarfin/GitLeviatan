# SPEC 12 — Cambiar de rama, fusionar y recordar el último proyecto

> **Estado:** Approved
> **Depende de:** SPEC 05, SPEC 07, SPEC 11
> **Fecha:** 2026-10-19
> **Objetivo:** Hacer cómodo el cambio de rama con un selector con búsqueda, permitir fusionar una rama en la rama actual con una vista previa y una política segura ante conflictos, y abrir automáticamente el último proyecto al iniciar la app.

## Por qué existe esta spec

El uso real ha puesto de manifiesto tres carencias del panel de ramas:

- **Cambiar de rama es incómodo.** Se hace pulsando el nombre en la lista de la barra lateral, sin aviso ni confirmación del resultado. Con muchas ramas los nombres se truncan y no hay forma de buscar.
- **No se puede fusionar.** Falta la operación más habitual después de crear una rama. La SPEC 05 la dejó fuera a propósito, junto con la resolución de conflictos.
- **Se pierde el proyecto al reiniciar.** Tras cualquier reinicio de la app hay que volver a elegir el repositorio. Lo sufre especialmente quien desarrolla GitLeviatán abriendo su propio repositorio en modo desarrollo: al cambiar de rama, Git reescribe los archivos fuente y la recarga de Vite reinicia la interfaz. En una app instalada ese reinicio no ocurre, pero recordar el último proyecto es útil en cualquier caso.

## Alcance

**Dentro:**

- **Selector de rama** en la barra superior, junto a Fetch, Pull y Push: un botón con la rama actual que abre un modal con un buscador y la lista de ramas locales y remotas, operable con teclado.
- **Cambio de rama con mensajes claros:** el resultado se confirma («Cambiaste a _x_») y, si Git se niega por cambios locales que se sobrescribirían, se explica y se listan los archivos afectados. No se cambia de rama ni se tocan los archivos.
- **Fusionar una rama en la rama actual:** acción **Fusionar** en cada rama de la lista, con un modal que muestra una vista previa (cuántos commits entran y si basta con avanzar la rama o se creará un commit de fusión) antes de confirmar.
- **Política ante conflictos:** si la fusión tiene conflictos, la app la cancela sola (`git merge --abort`), deja el repositorio exactamente como estaba y muestra los archivos en conflicto. La resolución de conflictos sigue fuera de alcance.
- **Condiciones previas claras:** no se fusiona con un HEAD desacoplado ni con cambios sin commitear en archivos seguidos; el modal lo explica en lugar de dejar que Git falle sin contexto.
- **Fusionar ramas remotas** (por ejemplo `origin/main`) además de las locales.
- Comandos `merge_preview` y `merge_branch`.
- **Recordar el último proyecto:** al iniciar, la app abre el último proyecto que estaba abierto. Cerrarlo con **Cerrar repositorio** (SPEC 11) lo olvida. Preferencia **Abrir el último proyecto al iniciar** (activada por defecto).
- Errores con contexto y detalle técnico, teclado completo, colores solo desde tokens y contraste AA (SPEC 08).

**Fuera de alcance (para specs futuras):**

- Resolver conflictos dentro de la app (el usuario puede hacerlo con su terminal o su editor y volver).
- Rebase, cherry-pick, revert, squash y fusiones con estrategia o mensaje personalizados.
- Stash automático al cambiar de rama o fusionar.
- Fusionar una rama en otra distinta de la actual (se cambia primero a la de destino).
- Crear una pull request o una fusión remota.
- Un atajo de teclado global dedicado.
- Reabrir varios proyectos o recordar la disposición de la ventana.

## Modelo de datos

```ts
type MergePreview = {
  source: string;            // rama a fusionar ("feature" o "origin/main")
  target: string;            // rama actual
  commitsToMerge: number;    // commits de `source` que no están en `target`
  upToDate: boolean;         // `commitsToMerge === 0`: no hay nada que fusionar
  fastForward: boolean;      // basta con avanzar `target`, sin commit de fusión
  blocked: MergeBlock | null;
};

type MergeBlock =
  | { reason: "detachedHead" }
  | { reason: "localChanges"; files: string[] };

type MergeResult =
  | { status: "upToDate" }
  | { status: "fastForward"; oid: string }
  | { status: "merged"; oid: string }
  | { status: "conflict"; files: string[] }; // la fusión se canceló sola; nada cambió
```

```jsonc
// <config_dir>/settings.json (SPEC 07), con dos campos nuevos
{
  "version": 1,
  "theme": "system",
  "gitPath": null,
  "maxRecentRepositories": 20,
  "reopenLastRepository": true, // por defecto true
  "lastRepositoryPath": null // ruta del último proyecto abierto; null si se cerró
}
```

Convenciones:

- Comandos: `merge_preview(repositoryId, source)` y `merge_branch(repositoryId, source)`. Siempre fusionan **en la rama actual**.
- `merge_branch` ejecuta `git merge --no-edit -- <rama>`. Git avanza la rama si es posible; si no, crea un commit de fusión con su mensaje por defecto.
- Si Git informa de conflictos (`CONFLICT` en su salida), se leen los archivos sin fusionar con `git diff --name-only --diff-filter=U`, se ejecuta `git merge --abort` y se devuelve `{ status: "conflict", files }`. Tras abortar, `HEAD`, el índice y el working tree quedan como antes.
- Los nombres de rama se validan con las mismas reglas que `checkout_branch` (SPEC 05): nada que Git pueda interpretar como opción.
- Los dos campos nuevos de `settings.json` se leen con valores por defecto si faltan, de modo que un archivo de la SPEC 07 sigue siendo válido sin migración y la `version` sigue siendo 1. `lastRepositoryPath` se actualiza al abrir un proyecto y se pone a `null` al cerrarlo con **Cerrar repositorio**.
- Si al iniciar el último proyecto ya no existe o no es un repositorio, se ignora sin mostrar un error y se borra la ruta guardada.

## Plan de implementación

1. Añadir `merge_preview` y `merge_branch` en `git/branches.rs`. Pruebas de integración contra Git real: avance rápido, fusión con commit, rama ya incluida, conflicto (la fusión se cancela y el repositorio queda idéntico), HEAD desacoplado, cambios locales que bloquean, rama remota, nombres inválidos y un repositorio con archivos sin seguimiento.
2. Mejorar los errores de `checkout_branch`: reconocer «would be overwritten» y devolver un mensaje claro con los archivos afectados, sin cambiar de rama. Pruebas con Git real.
3. Exponer los comandos en `commands/` y `lib.rs`, añadir tipos a `types/git.ts` y las llamadas a `lib/api.ts`. Pruebas de que los fallos llegan como `AppError`.
4. Crear el selector de rama en `features/branches`: botón con la rama actual en la barra superior, modal con buscador y lista (locales y remotas), teclado completo (flechas, Enter, `Esc`), resultado confirmado y errores con contexto. Pruebas de componente.
5. Crear el flujo **Fusionar**: acción en cada rama de la lista, modal con la vista previa, confirmación, resultado y lista de conflictos. Refrescar grafo, estado y ramas tras fusionar. Pruebas de componente y del recorrido completo.
6. Recordar el último proyecto: campos nuevos en `Settings` con valores por defecto, apertura automática al iniciar, olvido al cerrar, ruta inexistente ignorada y la preferencia en el diálogo de Preferencias. Pruebas de Rust (archivo de la SPEC 07 sin los campos nuevos) y de frontend.
7. Revisión visual manual en tema claro y oscuro; actualizar `docs/shortcuts.md` y `CHANGELOG.md`.

## Criterios de aceptación

- [ ] Hay un selector de rama en la barra superior que muestra la rama actual y permite buscar y cambiar de rama con teclado.
- [ ] Cambiar de rama confirma el resultado, y si Git se niega por cambios locales lo explica y lista los archivos, sin cambiar de rama.
- [ ] **Fusionar** muestra antes de confirmar cuántos commits entran y si se avanzará la rama o se creará un commit de fusión.
- [ ] Una fusión de avance rápido y una con commit de fusión dejan el mismo historial que la CLI de Git.
- [ ] Una fusión con conflictos se cancela sola, deja `HEAD`, el índice y los archivos exactamente como estaban y muestra los archivos en conflicto.
- [ ] No se puede fusionar con un HEAD desacoplado ni con cambios locales que lo impidan, y el modal lo explica.
- [ ] Fusionar una rama que ya está incluida lo indica y no hace nada.
- [ ] Se puede fusionar una rama remota, por ejemplo `origin/main`.
- [ ] Tras fusionar, el grafo, el estado y la lista de ramas se actualizan.
- [ ] Al iniciar, la app abre el último proyecto; **Cerrar repositorio** lo olvida; si la ruta ya no existe, la app inicia sin error.
- [ ] La preferencia **Abrir el último proyecto al iniciar** se puede desactivar.
- [ ] Un `settings.json` de la SPEC 07 sin los campos nuevos se carga sin respaldarse ni perder datos.
- [ ] Todo es operable con teclado y los colores nuevos salen de los tokens y cumplen contraste AA en ambos temas.
- [ ] Un fallo de Git se muestra con contexto y detalle técnico.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** cancelar sola una fusión con conflictos y listar los archivos. Sin una interfaz de resolución, dejar el repositorio a medias es peor que no fusionar. Propuesta por defecto; confirmar al aprobar.
- **No:** dejar la fusión en curso con un botón «Abortar fusión». Es más flexible, pero deja el repositorio en un estado intermedio que la app todavía no sabe manejar.
- **Sí:** el selector de rama es un modal con buscador, reutilizando `Modal`. Es accesible, ya tiene foco atrapado y `Esc`, y es coherente con el resto de diálogos. Un menú desplegable propio quedaría más ligero, pero exige un componente nuevo de popover; se puede revisar después.
- **Sí:** mantener la lista de ramas de la barra lateral. El selector es un complemento, no un reemplazo.
- **Sí:** fusionar siempre en la rama actual. Es el modelo de Git y evita ambigüedades; para otro destino se cambia primero de rama.
- **Sí:** exigir que no haya cambios sin commitear en archivos seguidos para fusionar. Git a veces lo permite, pero una fusión sobre un árbol sucio es la fuente más común de pérdidas y de errores difíciles de explicar. Los archivos sin seguimiento no bloquean.
- **No:** stash automático. Esconde cambios sin que el usuario lo sepa.
- **Sí:** fast-forward cuando sea posible, y commit de fusión con el mensaje por defecto de Git cuando no. Es el comportamiento que esperan quienes usan la CLI.
- **Sí:** permitir fusionar ramas remotas. Es habitual después de un fetch.
- **Sí:** recordar el último proyecto en `settings.json`, con la preferencia activada por defecto, y olvidarlo al cerrar explícitamente. Así reiniciar o recargar no hace perder el contexto, y quien cierra el proyecto no vuelve a verlo abierto.
- **Sí:** los campos nuevos de `settings.json` son opcionales con valor por defecto. Evita migraciones y que un archivo válido de la SPEC 07 se respalde por error.
- **No:** un atajo de teclado dedicado, por la misma razón que en las SPEC 10 y 11.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| `git merge --abort` falla o deja el repositorio a medias | Pruebas con Git real que comparan `HEAD`, el índice y el working tree antes y después; si abortar falla, se muestra el error con el detalle técnico y la salida de `git status`. |
| Fusionar en la rama equivocada | El modal muestra siempre la rama de origen y la de destino con sus nombres completos, y el selector indica cuál es la actual. |
| Detectar conflictos por texto de la salida de Git, que cambia entre versiones e idiomas | `LC_ALL=C`; además se consultan los archivos sin fusionar con `git diff --diff-filter=U`, no solo el texto. |
| La fusión de una rama remota desactualizada produce resultados inesperados | La vista previa cuenta los commits reales; el modal sugiere hacer fetch si la rama remota no se ha actualizado. |
| Reabrir automáticamente un proyecto que cambió de sitio o es lento de abrir | Ruta inexistente o fallo al abrir se ignoran sin error y borran la ruta guardada; la apertura no bloquea la interfaz. |
| Abrir el último proyecto sorprende a quien esperaba la pantalla inicial | Preferencia desactivable y **Cerrar repositorio** lo olvida. |
| Lista de ramas muy larga en el modal | Buscador y lista virtualizable si hace falta; con cientos de ramas el filtrado sigue siendo instantáneo. |

## Lo que **no** está en esta spec

- Resolver conflictos, rebase, cherry-pick, revert, squash y stash.
- Fusionar en una rama distinta de la actual y crear pull requests.
- Atajos de teclado globales nuevos, y recordar la disposición de la ventana o varios proyectos.

Cada uno entra, si llega, en su propia spec.
