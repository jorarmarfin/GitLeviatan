# Rendimiento del historial y del grafo

Línea base de la SPEC 03 y umbrales de la SPEC 08 (ver [Umbrales](#umbrales-spec-08)).

## Cómo se midió

- **Máquina:** Ubuntu, Git 2.43, build `--release` de Rust, Node 24 con jsdom.
- **Repositorios:** `tests/perf/gen_repo.py <dir> <n>` crea un historial sintético con `git fast-import`.
  Cada 10 commits de `main` hay un merge de una rama lateral, así que los totales reales son ~10 % mayores
  (1 100, 11 000 y 110 000 commits).
- **Backend (Rust):** `GL_PERF_REPO=<ruta> cargo test --release perf_list_commits -- --ignored --nocapture`
  mide `list_commits` (página de 500) y `get_status`. Incluye ejecutar `git log` y parsear la salida.
- **Frontend:** `PERF=1 pnpm vitest run src/features/graph/perf.test.tsx --silent=false` mide el layout de carriles,
  el montaje de `GraphView` y 200 eventos de scroll.

## Resultados

### Carga (backend, página de 500 commits)

| Commits | Primera página | Página media | Última página | `get_status` |
| ------: | -------------: | -----------: | ------------: | -----------: |
|   1 100 |         8,0 ms |       7,9 ms |        8,0 ms |       1,6 ms |
|  11 000 |        46,9 ms |      56,3 ms |       52,3 ms |       1,6 ms |
| 110 000 |       474,4 ms |     471,4 ms |      478,2 ms |       1,9 ms |

El coste crece con el tamaño total del historial y no con la posición de la página: `--topo-order` obliga a Git
a recorrer todo el grafo antes de emitir el primer commit.

### Layout y desplazamiento (frontend, jsdom)

| Commits | Layout completo | Montaje de `GraphView` | Filas en el DOM | Scroll (JS por evento) |
| ------: | --------------: | ---------------------: | --------------: | ---------------------: |
|   1 100 |          2,7 ms |                81,2 ms |              30 |                4,19 ms |
|  11 000 |          7,0 ms |                16,7 ms |              30 |                4,31 ms |
| 110 000 |         79,9 ms |                16,7 ms |              30 |                3,91 ms |

El montaje del primer caso incluye el calentamiento de jsdom. El layout completo se hace por páginas en la app
(500 commits cada vez), de modo que el coste real por página es una fracción de estos tiempos.

## Qué significan y qué no

- El número de filas en el DOM es constante (30 en una ventana de 600 px) y no depende del tamaño del historial.
- El tiempo de scroll es **solo el coste de JavaScript/React** por evento en jsdom; no incluye layout ni pintado del navegador.
  La fluidez real (FPS) en la ventana de Tauri **no está medida**: queda pendiente con las DevTools de la app.
- El historial sintético es poco ramificado (2 carriles como máximo). Un repositorio con muchas ramas simultáneas
  usará más carriles y más aristas por fila; conviene repetir la medición con repositorios reales grandes.

## Conclusiones para la SPEC 08

- El cuello de botella medido está en Git (`--topo-order`, ~0,5 s a 110 000 commits), no en la UI.
- Si 0,5 s resulta excesivo, la opción es cargar sin `--topo-order` o con un cursor por oid (ver riesgo de `--skip` en la SPEC 02).

## Umbrales (SPEC 08)

Viven en `tests/perf/thresholds.json` con el formato `{ "<métrica>": { "maxMs": number } }` y los comprueban dos
pruebas que corren siempre, también en CI:

- Rust: `cargo test perf_stays_within_thresholds` (`src-tauri/src/git/operations.rs`). Genera con `git fast-import`
  un repositorio de ~11 000 commits y mide `list_commits` (página de 500) y `get_status`.
- Frontend: `pnpm vitest run src/features/graph/perf.test.tsx`. Mide layout, montaje y scroll de un historial
  sintético de 110 000 commits.

Ambas toman el **mejor de 3 intentos** para que el ruido de una máquina compartida no dé falsos positivos.

| Métrica                         | Medido (build debug, Ubuntu) | Umbral |
| ------------------------------- | ---------------------------: | -----: |
| `backend_list_commits_page_11k` |                        47 ms | 500 ms |
| `backend_get_status_11k`        |                       1,3 ms | 100 ms |
| `frontend_layout_110k`          |                     50–67 ms | 600 ms |
| `frontend_mount_110k`           |                     28–34 ms | 300 ms |
| `frontend_scroll_event`         |                3,6 ms/evento |  40 ms |

Los umbrales dejan ~10× de margen sobre la medición: detectan una regresión de orden de magnitud (p. ej. volver a una
carga O(n²)), no variaciones del 20 %. Si una mejora real baja los tiempos de forma sostenida, conviene apretarlos.
Los 110 000 commits del backend (≈ 0,5 s) siguen siendo una medición manual (`perf_list_commits`) por el coste de
generar el repositorio en cada ejecución.
