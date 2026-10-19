# Rendimiento del historial y del grafo

Línea base de la SPEC 03. **No son umbrales**: los umbrales se fijan en la SPEC 08 a partir de estos números.

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
