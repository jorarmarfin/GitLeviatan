# SPEC 03 — Grafo de commits y ramas

> **Estado:** Borrador
> **Depende de:** SPEC 02
> **Fecha:** 2026-10-19
> **Objetivo:** Mostrar el historial como un grafo SVG con carriles, merges y etiquetas de referencias, con selección de commits y detalle, sin bloquear la UI en historiales grandes.

## Por qué existe esta spec

Es la Fase 2 y el mayor riesgo técnico del proyecto ("complejidad del grafo Git"). Se aísla para prototipar y medir antes de construir más funciones encima.

## Alcance

**Dentro:**

- Algoritmo de asignación de carriles en TypeScript puro (`features/graph/layout.ts`), incremental para soportar paginación.
- Render SVG propio con virtualización por ventana (filas de alto fijo).
- Merges con múltiples padres (incluido octopus) y ramas que divergen y convergen.
- Etiquetas de referencias: HEAD, ramas locales, ramas remotas y tags.
- Selección con ratón y teclado (flechas, Inicio/Fin).
- Panel de detalle del commit seleccionado vía `get_commit`.
- Carga de historial en páginas de 500 commits al acercarse al final.
- Línea base de rendimiento registrada en `docs/performance.md`.

**Fuera de alcance (para specs futuras):**

- Filtros, búsqueda y ocultar ramas.
- Diff de commits históricos y lista de archivos por commit.
- Acciones sobre commits (cherry-pick, revert, reset, rebase).
- Evaluar o adoptar una librería de grafos.
- Umbrales cuantitativos de rendimiento (se fijan tras la línea base, en SPEC 08).

## Modelo de datos

```ts
// src/features/graph/types.ts
type GraphEdge = {
  fromLane: number;
  toLane: number;
  kind: "straight" | "merge" | "fork";
};

type GraphRow = {
  oid: string;
  lane: number;        // carril del nodo
  colorIndex: number;  // índice en la paleta de carriles
  edges: GraphEdge[];  // segmentos que cruzan esta fila
  laneCount: number;   // carriles activos, para el ancho
};

type CommitDetail = CommitNode & {
  body: string;
  committer: string;
  committedAt: string;
};

type RefKind = "head" | "local" | "remote" | "tag";
type RefLabel = { name: string; kind: RefKind };
```

Convenciones:

- `layout.ts` expone `computeGraphRows(commits, state)` y devuelve `{ rows, state }`; `state` permite continuar con la siguiente página.
- Orden de entrada: `--topo-order` de `git log --all`, como en SPEC 02.
- Comando nuevo: `get_commit(repositoryId, oid) -> CommitDetail`.
- Mensajes de commit siempre como texto, nunca HTML.

## Plan de implementación

1. Crear `features/graph/types.ts` y `layout.ts` con el caso lineal. Prueba Vitest con 5 commits.
2. Añadir merges de dos padres y bifurcaciones al algoritmo. Pruebas con fixtures JSON.
3. Añadir merges octopus y reutilización de carriles. Pruebas con fixtures.
4. Hacer `computeGraphRows` incremental con `state`. Prueba: calcular en una pasada equivale a calcular por páginas.
5. Crear `GraphView.tsx` que pinta nodos y aristas SVG de una lista fija de filas. Verificación visual con un repo real.
6. Añadir virtualización por ventana. Verificación: el DOM mantiene un número acotado de filas con 10 000 commits.
7. Parsear `%D` en `RefLabel` y mostrar etiquetas junto al asunto.
8. Añadir selección por ratón y teclado con foco accesible.
9. Implementar el comando `get_commit` en Rust y el panel de detalle.
10. Conectar la carga de páginas de 500 al desplazamiento.
11. Medir tiempos con repositorios de 1 000, 10 000 y 100 000 commits y registrarlos en `docs/performance.md`.

## Criterios de aceptación

- [ ] Un repositorio de prueba con ramas y merges muestra cada merge con sus dos líneas hacia los padres.
- [ ] Un merge octopus (3 o más padres) se dibuja con todas sus aristas.
- [ ] Las etiquetas HEAD, rama local, rama remota y tag aparecen en el commit correcto.
- [ ] Calcular el layout de una vez o por páginas produce el mismo resultado (prueba automatizada).
- [ ] Con 10 000 commits, el DOM contiene como máximo 100 filas del grafo a la vez.
- [ ] Las flechas arriba/abajo cambian la selección y el panel de detalle muestra el commit seleccionado.
- [ ] El cuerpo del mensaje de commit se muestra como texto, aunque contenga etiquetas HTML.
- [ ] `docs/performance.md` contiene tiempos de carga y de desplazamiento para 1 000, 10 000 y 100 000 commits.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** SVG personalizado. Control sobre diseño y rendimiento (decisión del documento de producto).
- **No:** librería de grafos. Solo se reevalúa si el prototipo no cumple.
- **Sí:** layout en TypeScript, no en Rust. Se prueba rápido con Vitest y el render lo necesita en el frontend.
- **Sí:** virtualización propia con filas de alto fijo. Evita añadir una dependencia y el alto fijo simplifica el SVG.
- **Sí:** páginas de 500. Equilibrio entre latencia y número de peticiones; ajustable tras medir.
- **No:** diff de commits en esta spec. Mantiene el alcance acotado.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar los supuestos al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Layout lento o con demasiados carriles en repos muy ramificados | Medir con repos reales; limitar carriles visibles y reutilizarlos. |
| `--skip` costoso en páginas profundas | Registrar la medición; cambiar a cursor por oid si es necesario. |
| Colores insuficientes para muchos carriles | Paleta cíclica con contraste accesible en claro y oscuro. |
| Accesibilidad del SVG | `role="listbox"`, texto alternativo por fila y foco visible. |

## Lo que **no** está en esta spec

- Filtros, búsqueda, acciones sobre commits y diff histórico.
- Umbrales de rendimiento cuantitativos.
- Cambios en escritura (stage, commit) o ramas.

Cada uno entra, si llega, en su propia spec.
