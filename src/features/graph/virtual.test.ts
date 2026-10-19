import { describe, expect, it } from "vitest";

import { visibleRange } from "./virtual";

describe("visibleRange", () => {
  it("monta un número acotado de filas con 10 000 commits", () => {
    for (const scrollTop of [0, 5_000, 140_000, 279_000]) {
      const { start, end } = visibleRange(scrollTop, 800, 10_000);
      expect(end - start).toBeLessThanOrEqual(100);
    }
  });

  it("no se sale de los límites", () => {
    expect(visibleRange(0, 800, 5)).toEqual({ start: 0, end: 5 });
    expect(visibleRange(-50, 800, 0)).toEqual({ start: 0, end: 0 });
    const { start, end } = visibleRange(1e9, 800, 100);
    expect(start).toBeLessThanOrEqual(end);
    expect(end).toBe(100);
  });
});
