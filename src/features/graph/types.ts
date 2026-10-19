import type { CommitNode } from "@/types/git";

/**
 * Segmento que cruza una fila. El nodo del commit está en el centro vertical.
 * - straight: carril que atraviesa la fila (arriba → abajo, mismo carril).
 * - fork: llega desde arriba (`fromLane`) hasta el nodo (`toLane` = carril del nodo).
 * - merge: sale del nodo (`fromLane` = carril del nodo) hacia abajo, al carril de un padre.
 */
export type GraphEdge = {
  fromLane: number;
  toLane: number;
  kind: "straight" | "merge" | "fork";
  colorIndex: number;
};

export type GraphRow = {
  oid: string;
  lane: number; // carril del nodo
  colorIndex: number; // índice en la paleta de carriles
  edges: GraphEdge[]; // segmentos que cruzan esta fila
  laneCount: number; // carriles usados en esta fila, para el ancho
};

export type CommitDetail = CommitNode & {
  body: string;
  committer: string;
  committedAt: string;
};

export type RefKind = "head" | "local" | "remote" | "tag";
export type RefLabel = { name: string; kind: RefKind };

/** Estado que permite continuar el layout con la página siguiente. */
export type LayoutState = {
  lanes: (string | null)[]; // oid esperado en cada carril
  colors: number[]; // color de cada carril
  nextColor: number;
};
