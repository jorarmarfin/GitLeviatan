import { describe, expect, it } from "vitest";

import { computeGraphRows, initialLayoutState } from "./layout";

const c = (oid: string, ...parents: string[]) => ({ oid, parents });
const edgesOf = (
  row: { edges: { kind: string; fromLane: number; toLane: number }[] },
  kind: string,
) => row.edges.filter((e) => e.kind === kind).map((e) => [e.fromLane, e.toLane]);

describe("computeGraphRows", () => {
  it("coloca un historial lineal en un solo carril", () => {
    const { rows } = computeGraphRows([c("c3", "c2"), c("c2", "c1"), c("c1")]);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(rows.map((r) => r.laneCount)).toEqual([1, 1, 1]);
    expect(edgesOf(rows[0], "merge")).toEqual([[0, 0]]);
    expect(edgesOf(rows[1], "fork")).toEqual([[0, 0]]);
    expect(edgesOf(rows[2], "merge")).toEqual([]); // raíz: no hay padres
    expect(new Set(rows.map((r) => r.colorIndex)).size).toBe(1);
  });

  it("dibuja un merge con una línea hacia cada padre y converge en la base", () => {
    // M fusiona A y B, ambos hijos de R.
    const { rows } = computeGraphRows([c("M", "A", "B"), c("A", "R"), c("B", "R"), c("R")]);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 1, 0]);
    expect(edgesOf(rows[0], "merge")).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(edgesOf(rows[1], "straight")).toEqual([[1, 1]]); // B sigue en su carril
    expect(edgesOf(rows[2], "straight")).toEqual([[0, 0]]); // R espera en el carril 0
    expect(edgesOf(rows[2], "merge")).toEqual([[1, 0]]); // B se une al carril de R
    expect(rows[0].laneCount).toBe(2);
    expect(rows[0].colorIndex).not.toBe(rows[2].colorIndex);
  });

  it("dibuja todas las aristas de un merge octopus", () => {
    const { rows } = computeGraphRows([c("M", "a", "b", "c"), c("a"), c("b"), c("c")]);
    expect(edgesOf(rows[0], "merge")).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(rows[0].laneCount).toBe(3);
    expect(rows.slice(1).map((r) => r.lane)).toEqual([0, 1, 2]);
  });

  it("reutiliza carriles liberados", () => {
    const { rows, state } = computeGraphRows([c("x1", "x0"), c("x0"), c("y1", "y0"), c("y0")]);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0, 0]);
    expect(state.lanes).toEqual([]);
  });

  it("converge varias ramas hijas en un mismo padre", () => {
    const { rows } = computeGraphRows([c("b1", "base"), c("b2", "base"), c("base")]);
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0]);
    // base recibe una línea por cada rama que la esperaba, pero b2 ya la unió al carril 0
    expect(edgesOf(rows[2], "fork")).toEqual([[0, 0]]);
  });

  it("no muta el estado de entrada", () => {
    const first = computeGraphRows([c("a", "b")]);
    const snapshot = JSON.stringify(first.state);
    computeGraphRows([c("b")], first.state);
    expect(JSON.stringify(first.state)).toBe(snapshot);
  });

  it("calcular de una vez equivale a calcular por páginas", () => {
    // DAG determinista con merges: el commit i tiene a i-1 y, a veces, a otro anterior.
    const commits = [];
    const total = 400;
    for (let i = total; i >= 1; i--) {
      const parents: string[] = [];
      if (i > 1) parents.push(`c${i - 1}`);
      if (i % 7 === 0 && i > 12) parents.push(`c${i - 1 - (i % 5) - 1}`);
      if (i % 31 === 0 && i > 40) parents.push(`c${i - 20}`);
      commits.push(c(`c${i}`, ...parents));
    }

    const whole = computeGraphRows(commits).rows;

    const paged = [];
    let state = initialLayoutState();
    for (let start = 0; start < commits.length; start += 37) {
      const result = computeGraphRows(commits.slice(start, start + 37), state);
      paged.push(...result.rows);
      state = result.state;
    }
    expect(paged).toEqual(whole);
  });

  it("nunca referencia carriles fuera de laneCount", () => {
    const commits = [c("m", "a", "b"), c("a", "r"), c("b", "r"), c("r")];
    for (const row of computeGraphRows(commits).rows) {
      for (const e of row.edges) {
        expect(e.fromLane).toBeLessThan(row.laneCount);
        expect(e.toLane).toBeLessThan(row.laneCount);
      }
    }
  });
});
