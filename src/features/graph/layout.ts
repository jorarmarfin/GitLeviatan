import type { CommitNode } from "@/types/git";

import type { GraphEdge, GraphRow, LayoutState } from "./types";

export function initialLayoutState(): LayoutState {
  return { lanes: [], colors: [], nextColor: 0 };
}

type GraphInput = Pick<CommitNode, "oid" | "parents">;

/**
 * Asigna carriles a commits en orden topológico (hijos antes que padres).
 * No muta `previous`: devuelve un estado nuevo para continuar con la siguiente página.
 */
export function computeGraphRows(
  commits: readonly GraphInput[],
  previous: LayoutState = initialLayoutState(),
): { rows: GraphRow[]; state: LayoutState } {
  const lanes = [...previous.lanes];
  const colors = [...previous.colors];
  let nextColor = previous.nextColor;
  const rows: GraphRow[] = [];

  function freeLane(): number {
    const free = lanes.indexOf(null);
    if (free >= 0) return free;
    lanes.push(null);
    colors.push(0);
    return lanes.length - 1;
  }

  for (const commit of commits) {
    const edges: GraphEdge[] = [];

    // Carriles que atraviesan esta fila sin tocar el nodo.
    lanes.forEach((expected, i) => {
      if (expected !== null && expected !== commit.oid) {
        edges.push({ fromLane: i, toLane: i, kind: "straight", colorIndex: colors[i] });
      }
    });

    // Carriles que esperaban a este commit: convergen en el nodo.
    const matches: number[] = [];
    lanes.forEach((expected, i) => {
      if (expected === commit.oid) matches.push(i);
    });

    let lane: number;
    let colorIndex: number;
    if (matches.length === 0) {
      lane = freeLane(); // punta de rama que nadie esperaba
      colorIndex = nextColor++;
    } else {
      lane = matches[0];
      colorIndex = colors[lane];
    }
    for (const m of matches) {
      edges.push({ fromLane: m, toLane: lane, kind: "fork", colorIndex: colors[m] });
      lanes[m] = null;
    }

    // Padres: el primero continúa el carril; los demás abren o reutilizan carriles.
    commit.parents.forEach((parent, k) => {
      let target = lanes.indexOf(parent);
      let targetColor: number;
      if (target >= 0) {
        targetColor = colors[target];
      } else if (k === 0) {
        target = lane;
        lanes[lane] = parent;
        colors[lane] = colorIndex;
        targetColor = colorIndex;
      } else {
        target = freeLane();
        lanes[target] = parent;
        colors[target] = nextColor++;
        targetColor = colors[target];
      }
      edges.push({ fromLane: lane, toLane: target, kind: "merge", colorIndex: targetColor });
    });

    let laneCount = lane + 1;
    for (const edge of edges) {
      laneCount = Math.max(laneCount, edge.fromLane + 1, edge.toLane + 1);
    }
    rows.push({ oid: commit.oid, lane, colorIndex, edges, laneCount });

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
      colors.pop();
    }
  }

  return { rows, state: { lanes, colors, nextColor } };
}
