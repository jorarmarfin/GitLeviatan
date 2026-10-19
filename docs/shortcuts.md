# Atajos de teclado y navegación

Todo lo que se puede hacer con el ratón se puede hacer con el teclado. En macOS, `Ctrl` se sustituye por `⌘`
donde se indica.

## Globales

| Atajo               | Acción                                     |
| ------------------- | ------------------------------------------ |
| `Alt+1`             | Foco en la barra lateral (ramas, remotos). |
| `Alt+2`             | Foco en el historial de commits.           |
| `Alt+3`             | Foco en el panel de cambios.               |
| `Ctrl+,` (`⌘+,`)    | Abrir Preferencias.                        |
| `Tab` / `Mayús+Tab` | Siguiente / anterior elemento operable.    |
| `Enter` / `Espacio` | Activar el botón con el foco.              |

Los atajos globales se ignoran mientras hay un diálogo abierto.

## Historial de commits

La lista tiene el foco con `Alt+2` (o con `Tab`). La selección sigue al foco y abre el detalle del commit.

| Atajo               | Acción                       |
| ------------------- | ---------------------------- |
| `↓` / `↑`           | Commit siguiente / anterior. |
| `Re Pág` / `Av Pág` | Subir / bajar una página.    |
| `Inicio`            | Primer commit.               |
| `Fin`               | Último commit cargado.       |

## Cambios y commit

| Atajo                     | Acción                                                                            |
| ------------------------- | --------------------------------------------------------------------------------- |
| `Tab`                     | Recorre cada archivo (ver diff) y su botón preparar/quitar.                       |
| `Enter` / `Espacio`       | Sobre un archivo: muestra su diff. Sobre `+`/`−`: prepara o quita de staged.      |
| `Ctrl+Enter` (`⌘+Enter`)  | En el mensaje de commit: crea el commit.                                          |
| `Tab` → **Preparar todo** | Al inicio del panel: prepara todo (`git add -A`). `Enter` o `Espacio` lo activan. |
| `Tab` → **Quitar todo**   | En la cabecera de Staged: quita todo de staged sin tocar tus archivos.            |

## Proyectos: recientes y cierre

| Atajo                              | Acción                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `Tab` sobre un proyecto reciente   | Foco en su nombre y, con otro `Tab`, en su **×** (que aparece al enfocarla).            |
| `Enter` / `Espacio` sobre la **×** | Quita el proyecto de la lista de recientes. No borra el repositorio ni nada del disco.  |
| `Tab` hasta **Cerrar repositorio** | En la cabecera: vuelve a la pantalla inicial. Deshabilitado durante fetch, pull o push. |

## Diálogos (crear rama, eliminar rama, clonar, Preferencias)

| Atajo               | Acción                                              |
| ------------------- | --------------------------------------------------- |
| `Esc`               | Cierra el diálogo (no durante un clonado en curso). |
| `Tab` / `Mayús+Tab` | Recorre el diálogo; el foco no sale de él.          |
| `Enter`             | Envía el formulario.                                |

Al cerrar un diálogo, el foco vuelve al elemento que lo abrió.

## Notas de accesibilidad

- Todo elemento con foco muestra un contorno visible (`:focus-visible`).
- El historial es un `listbox` con `aria-activedescendant`; los errores se anuncian con `role="alert"`.
- Los contrastes de texto cumplen WCAG AA en tema claro y oscuro (ver `src/index.contrast.test.ts`).
