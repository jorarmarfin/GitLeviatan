# SPEC 14 — Archivos de un commit a pantalla completa

> **Estado:** Approved
> **Depende de:** SPEC 03, SPEC 04, SPEC 08
> **Fecha:** 2026-10-19
> **Objetivo:** Al hacer doble clic (o Enter) sobre un commit del historial, abrir una vista a pantalla completa con la lista desplazable de sus archivos modificados y el diff de cada uno, con un botón para volver al historial exactamente donde estaba.

## Por qué existe esta spec

El detalle del commit (SPEC 03) muestra mensaje, autor y padres, pero no qué archivos cambió. La SPEC 04 dejó fuera «el diff de commits históricos y la lista de archivos por commit», así que hoy hay que salir a la terminal para saberlo.

El panel derecho mide 22 rem y el panel inferior ya está ocupado por los cambios del working tree: meter ahí la lista y un diff sacrificaría el grafo o dejaría un visor ilegible. Una vista temporal a pantalla completa da todo el espacio al diff sin quitarlo para siempre, y volver es un gesto.

## Alcance

**Dentro:**

- **Abrir la vista:** doble clic sobre un commit del grafo, o `Enter` con el foco en el historial. El clic simple y las flechas siguen mostrando solo el detalle (SPEC 03).
- **Vista a pantalla completa** que sustituye la zona de trabajo (barra lateral, grafo y cambios) mientras está abierta, con cabecera: botón **Volver al historial**, oid corto, asunto, autor y fecha del commit.
- **Lista de archivos modificados** con scroll propio: estado (añadido, modificado, eliminado, renombrado, copiado, cambio de tipo), ruta (con la ruta original en los renombrados) y líneas añadidas y eliminadas (`+12 −3`; `binario` para binarios). Un resumen arriba: «N archivos, +X −Y».
- **Filtro por nombre** sobre la lista (texto contenido en la ruta, sin distinguir mayúsculas).
- **Diff del archivo seleccionado** en el visor Monaco existente (SPEC 04), comparando la versión del primer padre con la del commit. El primer archivo queda seleccionado al abrir.
- **Commits de fusión:** se muestran los cambios respecto al **primer padre**, y la cabecera lo indica.
- **Commit raíz:** todos sus archivos aparecen como añadidos.
- **Tope de 500 archivos:** si el commit toca más, se listan los primeros 500 y se avisa con cuántos hay en total.
- **Volver sin perder el sitio:** al volver, el grafo conserva su scroll y su selección, y el foco regresa al commit del que se salió. `Esc` también vuelve.
- Comandos `list_commit_files` y `get_commit_file_diff`.
- Errores con contexto y detalle técnico, teclado completo, colores solo desde tokens y contraste AA (SPEC 08).

**Fuera de alcance (para specs futuras):**

- Diff de un rango de commits o entre dos commits arbitrarios.
- Mostrar el commit contra el segundo padre (o cualquier otro) en las fusiones.
- Ver el archivo completo en esa revisión sin diff, ni navegar el árbol de archivos del commit.
- Historial de un archivo (`git log -- <ruta>`) y blame.
- Acciones sobre el commit desde esta vista: cherry-pick, revert, checkout del archivo, copiar el parche.
- Diff en línea («unificado») como alternativa al lado a lado, y ajustes de espacios en blanco.
- Un atajo de teclado global dedicado.

## Modelo de datos

```ts
type CommitFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "typechange";

type CommitFile = {
  path: string;                 // ruta en el commit (en eliminados, la que tenía)
  origPath: string | null;      // solo renombrados y copiados
  status: CommitFileStatus;
  additions: number | null;     // null en binarios
  deletions: number | null;
  isBinary: boolean;
};

type CommitFiles = {
  oid: string;
  comparedWith: string | null;  // oid del primer padre; null en el commit raíz
  isMerge: boolean;
  totalFiles: number;           // total real, aunque `files` esté recortado
  truncated: boolean;           // `totalFiles > files.length`
  files: CommitFile[];          // como mucho 500
};
```

`get_commit_file_diff` devuelve el `FileDiff` de la SPEC 04 sin cambios (`original`, `modified`, `isBinary`, `tooLarge`).

Convenciones:

- Comandos: `list_commit_files(repositoryId, oid)` y `get_commit_file_diff(repositoryId, oid, path, origPath)`.
- La lista sale de `git diff --raw --numstat -z -M <padre> <oid>` (dos pasadas o una con ambos formatos), siempre con `-z` y sin depender de la configuración del usuario (`--no-ext-diff`, `--no-textconv`). El padre es el primero de `<oid>`; en el commit raíz se compara contra el árbol vacío del repositorio (`git hash-object -t tree` con entrada vacía, para valer también en repositorios SHA-256).
- El contenido de cada lado se lee con `git show <rev>:<ruta>` con el mismo límite de 1 MiB y la misma detección de binarios que `get_diff`; en renombrados el lado original usa `origPath`.
- Las rutas y el oid se pasan como argumentos estructurados; el oid se valida con `is_valid_oid`. Rutas literales (`--literal-pathspecs`), nunca interpretadas como opción.
- Orden de la lista: el de Git (alfabético por ruta).
- Estado de UI: en `Workspace` un `view` que vale `history` o `commitFiles(oid)`. El `Workspace` **sigue montado** (oculto, `hidden`) mientras la vista está abierta, para conservar el scroll y la selección del grafo.
- Esta spec no añade campos a `settings.json` ni persiste nada.

## Plan de implementación

1. Añadir `list_commit_files` en `git/` (módulo de commits o `diff.rs`) con tipos en `types.rs`. Pruebas con Git real: añadido, modificado, eliminado, renombrado, binario, commit raíz, commit de fusión (contra el primer padre), rutas con espacios, acentos y saltos de línea, y el tope de 500 con `totalFiles` correcto.
2. Añadir `get_commit_file_diff` reutilizando la lectura y los límites de `get_diff`. Pruebas: texto, binario, archivo grande, eliminado (lado `modified` vacío), añadido (lado `original` vacío), renombrado y commit raíz.
3. Exponer los comandos en `commands/` y `lib.rs`, tipos en `types/git.ts` y llamadas en `lib/api.ts`. Pruebas de que los fallos llegan como `AppError`.
4. Crear `features/commits/CommitFilesView.tsx`: cabecera con **Volver**, resumen, filtro, lista desplazable y visor de diff (reutilizando `MonacoDiff`). Estados de carga, vacío («Este commit no cambia archivos»), error, binario y demasiado grande. Pruebas de componente.
5. Conectar la apertura: doble clic y `Enter` en el historial (`GraphView`), el `view` en `Workspace` con el `Workspace` oculto pero montado, `Esc` y **Volver**, y el retorno del foco al commit. Pruebas de componente y del recorrido completo (abrir, elegir archivo, volver y comprobar que la selección y el scroll siguen).
6. Revisión visual manual en tema claro y oscuro con un commit grande, uno de fusión y uno binario; actualizar `docs/shortcuts.md` y `CHANGELOG.md`.

## Criterios de aceptación

- [ ] El doble clic sobre un commit abre la vista de archivos; el clic simple y las flechas siguen mostrando solo el detalle.
- [ ] `Enter` con el foco en el historial abre la vista; `Esc` y **Volver al historial** la cierran.
- [ ] Al volver, el grafo mantiene su scroll y su selección, y el foco queda en el commit del que se salió.
- [ ] La lista coincide con `git diff --name-status -M <padre> <oid>` en estados y rutas, y con `--numstat` en líneas añadidas y eliminadas.
- [ ] Los archivos binarios se marcan como `binario` y no muestran diff de texto.
- [ ] Un renombrado muestra la ruta original y la nueva, y su diff compara ambas.
- [ ] Un commit de fusión muestra los cambios respecto al primer padre y la cabecera lo indica.
- [ ] El commit raíz muestra todos sus archivos como añadidos.
- [ ] Con más de 500 archivos se listan 500 y se avisa del total real.
- [ ] La lista tiene scroll propio y el filtro por nombre reduce las filas sin recargar.
- [ ] Al abrir, el primer archivo está seleccionado y su diff visible; al elegir otro, el diff cambia.
- [ ] Un archivo grande o binario muestra un aviso en lugar del diff, igual que en la SPEC 04.
- [ ] Un fallo de Git se muestra con contexto y detalle técnico.
- [ ] Todo es operable con teclado y los colores nuevos salen de los tokens y cumplen contraste AA en ambos temas.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** vista a pantalla completa con **Volver**, en lugar de usar el panel inferior. Se aceptó cualquiera de las dos; se elige la completa porque un diff lado a lado necesita ancho y alto, y el panel inferior ya está ocupado por los cambios del working tree. Es temporal, así que no quita espacio a la pantalla principal.
- **No:** reutilizar el panel «Cambios» para mostrar un commit. Mezclaría el estado del working tree con el historial y dejaría el diff en media pantalla.
- **No:** modal. Tapa el grafo con un solo nivel de foco y complica el scroll de la lista y del visor a la vez.
- **Sí:** el `Workspace` se queda montado y oculto. Desmontarlo reiniciaría el scroll y la selección del grafo, que se recarga al montarse.
- **Sí:** clic = detalle y doble clic o `Enter` = archivos. Mantiene el comportamiento de la SPEC 03 y evita pedir los archivos con cada flecha del historial.
- **Sí:** diff al elegir un archivo, con el visor Monaco y el contrato `FileDiff` de la SPEC 04. Cero visor nuevo y mismos límites y avisos.
- **Sí:** las fusiones se comparan con el primer padre (`git show -m --first-parent`). Es lo que aportó la fusión a la rama en la que se hizo. Mostrarlas vacías, como hace `git show` por defecto, dejaría la vista inútil justo en los commits de «Merge …» que abundan en este historial.
- **Sí:** tope de 500 archivos con aviso. Evita una lista y una carga enormes en commits masivos (importaciones, renombrados globales) sin esconder que el recorte existe.
- **Sí:** `-z` y rutas como argumentos estructurados. Es la única forma correcta de listar rutas con espacios, acentos o saltos de línea.
- **No:** acciones sobre el commit (cherry-pick, revert, restaurar archivo). Son operaciones que escriben; cada una exige su propia spec.
- **No:** un atajo de teclado global dedicado, por la misma razón que en las SPEC 10 a 13.
- **No:** persistir nada. La vista abierta no se recuerda al reiniciar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Commits con miles de archivos hacen lenta la lista | Tope de 500 en el backend (`totalFiles` informa del total) y filtro en el cliente; el diff se pide solo del archivo seleccionado. |
| Rutas con caracteres raros rompen el parseo | `-z`, pruebas con espacios, acentos y saltos de línea, y rutas siempre como argumentos estructurados. |
| `get_commit_file_diff` ejecuta filtros o drivers de diff externos del usuario | `--no-ext-diff` y `--no-textconv`; la lectura usa `git show <rev>:<ruta>` sin pasar por drivers. |
| Archivos binarios o enormes bloquean el visor | Misma detección y límite de 1 MiB que `get_diff`, con aviso en lugar de diff. |
| Perder el sitio en el grafo al volver | El `Workspace` queda montado y oculto; criterio de aceptación y prueba del recorrido completo. |
| Doble clic accidental al seleccionar | El clic simple sigue mostrando el detalle y **Volver** o `Esc` devuelven al instante. |
| Repositorios SHA-256 rompen una constante de árbol vacío | El árbol vacío se obtiene del propio repositorio, no se escribe a mano. |

## Lo que **no** está en esta spec

- Diff entre commits o rangos, y comparación contra el segundo padre.
- Navegar el árbol del commit, historial de un archivo y blame.
- Cherry-pick, revert, restaurar archivos y copiar parches.
- Diff unificado, opciones de espacios en blanco y atajos globales nuevos.

Cada uno entra, si llega, en su propia spec.
