# SPEC 10 — Preparar todo y retoque visual

> **Estado:** Approved
> **Depende de:** SPEC 04, SPEC 08
> **Fecha:** 2026-10-19
> **Objetivo:** Permitir preparar (`git add -A`) y quitar de staged (`git reset`) todos los cambios con un solo clic, y dar a la interfaz un retoque ligero de color basado en el logo, sin cambiar su estructura.

## Por qué existe esta spec

La SPEC 04 solo ofrece los botones `+` y `−` por archivo. En un repositorio con muchos cambios, preparar un commit obliga a pulsar decenas de veces. El uso real lo ha puesto de manifiesto: falta el equivalente a `git add .`.

Al tocar ese panel se aprovecha para un retoque visual pequeño. Hoy la interfaz es casi toda gris: el tipo de cada cambio, las secciones y las acciones principales no se distinguen de un vistazo, y nada recuerda al logo (azul eléctrico y naranja de Git sobre azul marino).

## Alcance

**Dentro:**

- Comando `stage_all`: prepara modificaciones, borrados y archivos nuevos del repositorio completo, respetando `.gitignore`.
- Comando `unstage_all`: saca todo del área de preparación sin tocar el working tree.
- Botón **Preparar todo** en el panel de cambios, visible mientras haya cambios sin preparar o archivos sin seguimiento.
- Botón **Quitar todo** en la cabecera de la sección Staged, visible mientras haya algo preparado.
- Ambos botones deshabilitados mientras hay otra operación en curso, y operables con teclado.
- Funcionamiento en un repositorio sin commits.
- Pruebas con muchos archivos: la operación no depende de la longitud de la línea de comandos.
- **Retoque de color basado en el logo**, solo con tokens de `index.css`:
  - Color primario azul (el del dragón) en botones principales, foco, rama actual y fila seleccionada; naranja de Git como acento puntual.
  - Fondo del tema oscuro con un ligero matiz azul marino en lugar de gris neutro.
  - Color por tipo de cambio en la lista de archivos (añadido verde, modificado ámbar, borrado rojo, renombrado violeta, sin seguimiento azul grisáceo), siempre junto al texto del tipo.
  - Cabeceras de sección Staged, Unstaged y Sin seguimiento con una marca de color y el contador como etiqueta.
  - Botón **Commit** destacado como acción principal; **Preparar todo** y **Quitar todo** con estilo secundario.
- Todos los pares de color nuevos pasan la prueba de contraste AA (SPEC 08) en tema claro y oscuro.

**Fuera de alcance (para specs futuras):**

- Botones «preparar todo» por sección (solo sin preparar o solo sin seguimiento).
- Preparar o quitar por carpeta o con selección múltiple.
- Stage por fragmento (hunk) o por línea.
- Descartar cambios del working tree (operación destructiva; spec propia).
- Un atajo de teclado global dedicado.
- Rediseño de la disposición, tipografías, iconos, animaciones o el logo.
- Colores personalizables por el usuario o más temas (se queda en claro, oscuro y sistema).
- Cambiar los colores de los carriles del grafo de commits (`--graph-*`).

## Modelo de datos

Esta spec no introduce estructuras de datos nuevas. Reutiliza `RepositoryStatus` (SPEC 02) y `AppError` (SPEC 08).

Tokens de color nuevos en `src/index.css` (con valores para `:root` y `.dark`): `--change-added`, `--change-modified`, `--change-deleted`, `--change-renamed`, `--change-untracked` y `--accent-git` (naranja). Cambian de valor `--primary`, `--ring` y los fondos del tema oscuro.

Convenciones:

- Comandos: `stage_all(repositoryId)` y `unstage_all(repositoryId)`, ambos devuelven `void`.
- `stage_all` ejecuta `git add -A` desde la raíz del repositorio, sin lista de rutas: no hay límite de argumentos que superar, ni siquiera en Windows.
- `unstage_all` ejecuta `git reset -q`. Funciona también en un repositorio sin commits, donde deja los archivos como sin seguimiento. Nunca modifica el working tree.
- Los errores se devuelven como `AppError` con el stderr de Git saneado.
- Ningún componente usa colores sueltos: todo sale de los tokens, de modo que ambos temas siguen funcionando.
- El color nunca es la única señal: cada tipo de cambio mantiene su texto.

## Plan de implementación

1. Añadir `stage_all` y `unstage_all` en `git/write.rs`. Pruebas de integración: modificación, borrado, archivo nuevo, carpetas anidadas, nombres especiales, archivos ignorados que no se preparan, repositorio sin commits, estado mixto (parte ya preparada) y que el resultado coincide con el de la CLI.
2. Exponer los comandos en `commands/` y en `lib.rs`, y añadirlos a `lib/api.ts`. Prueba de que un fallo de Git llega como `AppError`.
3. Añadir los botones **Preparar todo** y **Quitar todo** en `features/status`, con sus etiquetas accesibles y el estado deshabilitado durante una operación. Pruebas de componente, incluido el foco y la activación con teclado.
4. Prueba con un repositorio de varios miles de archivos sin seguimiento: `stage_all` termina y deja el estado correcto, y `unstage_all` lo revierte.
5. Definir la paleta en `src/index.css` (tokens de ambos temas) y ampliar `src/index.contrast.test.ts` con los pares nuevos: texto de cada tipo de cambio sobre fondo y sobre fila seleccionada, texto sobre `--primary` y foco.
6. Aplicar los tokens: botón primario y Commit, cabeceras de sección con contador, etiqueta de tipo de cambio con color, rama actual y fila seleccionada del grafo. Pruebas de componente de que el texto del tipo sigue presente.
7. Revisión visual manual en tema claro y oscuro con un repositorio real; ajustar lo que desentone.
8. Actualizar `docs/shortcuts.md` y `CHANGELOG.md`.

## Criterios de aceptación

- [ ] **Preparar todo** deja staged las modificaciones, los borrados y los archivos nuevos, y el estado coincide con el de `git add -A` en la CLI.
- [ ] Los archivos de `.gitignore` no se preparan.
- [ ] **Quitar todo** vacía la sección Staged sin modificar ningún archivo del working tree.
- [ ] Ambas operaciones funcionan en un repositorio sin commits.
- [ ] Con varios miles de archivos nuevos, **Preparar todo** termina sin error, también en Windows.
- [ ] Los botones solo aparecen cuando hay algo que preparar o quitar, y se deshabilitan mientras hay otra operación.
- [ ] Ambos botones se pueden alcanzar con Tab y activar con Enter o Espacio.
- [ ] Un fallo de Git se muestra con el contexto y el detalle técnico.
- [ ] El texto de la interfaz, incluidos los colores nuevos, cumple contraste AA en tema claro y oscuro (prueba automática).
- [ ] Cada tipo de cambio se distingue por su color y también por su texto.
- [ ] Ningún componente nuevo usa colores fuera de los tokens de `index.css`.
- [ ] La disposición de la interfaz no cambia y el grafo mantiene sus colores.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** `git add -A` sin lista de rutas. Evita el límite de longitud de la línea de comandos (unos 32 000 caracteres en Windows) y es exactamente lo que espera quien usa Git.
- **No:** reutilizar `stage_files` con todas las rutas. Fallaría con repositorios grandes.
- **Sí:** `git reset -q` para quitar todo. Es una sola orden válida con y sin commits; no requiere la rama especial de `git rm --cached` que usa `unstage_files`.
- **No:** pedir confirmación. Ninguna de las dos operaciones destruye datos: el working tree no cambia y se pueden deshacer con la operación contraria.
- **No:** botones por sección en esta spec. Preparar solo lo ya seguido (`git add -u`) o solo lo nuevo exigiría listas de rutas o más comandos; entra si hay demanda.
- **No:** atajo de teclado dedicado. Los botones ya son operables con teclado; añadir un atajo global se decide aparte para no multiplicar combinaciones. Propuesta por defecto; confirmar al aprobar.
- **Sí:** paleta tomada del logo (azul eléctrico, azul marino y naranja de Git). Da identidad sin añadir una paleta ajena.
- **Sí:** tokens en `index.css` y nada de colores en los componentes. Mantiene los dos temas coherentes y permite validar el contraste con la prueba existente.
- **No:** rediseñar la disposición ni cambiar tipografías. «Un poco de color» es un retoque, no una nueva interfaz.
- **No:** selector de color de acento para el usuario. Es una preferencia nueva con su propia validación de contraste; spec propia si hay demanda.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Preparar sin querer archivos grandes o secretos sin seguimiento (`.env`, claves) | `git add -A` respeta `.gitignore`; el usuario ve la sección Staged antes de commitear y puede usar **Quitar todo**. Valorar un aviso si hay archivos muy grandes en una spec futura. |
| `git add -A` lento en repositorios enormes | Se ejecuta fuera del hilo de la UI y el botón queda deshabilitado mientras corre. |
| Colores nuevos que no cumplen contraste, sobre todo en tema oscuro con fondo teñido | Ampliar la prueba de contraste en el paso 5, antes de aplicar los colores a los componentes. |
| Información solo por color (accesibilidad) | El texto del tipo de cambio se conserva y hay una prueba que lo comprueba. |
| Diferencias de comportamiento de `git reset` sin commits entre versiones de Git | Prueba explícita de repositorio sin commits; en caso de fallo se muestra el error de Git. |
| Fallos de `autocrlf` en Windows al preparar | Reutiliza la prueba de `autocrlf` de la SPEC 09; añadir un caso con `stage_all`. |

## Lo que **no** está en esta spec

- Botones por sección, selección múltiple, preparar por carpeta, hunks y descartar cambios.
- Atajos de teclado globales nuevos.
- Rediseño de la disposición, nuevos temas y colores personalizables.

Cada uno entra, si llega, en su propia spec.
