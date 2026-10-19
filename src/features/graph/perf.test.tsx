// Medición manual (no corre en CI): `PERF=1 pnpm vitest run src/features/graph/perf.test.tsx`
// Los resultados se anotan en docs/performance.md.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { CommitNode } from "@/types/git";

import { GraphView } from "./GraphView";
import { computeGraphRows } from "./layout";

/** Mismo patrón que tests/perf/gen_repo.py: un merge de rama lateral cada 10 commits. */
function syntheticHistory(total: number): CommitNode[] {
  const commits: CommitNode[] = [];
  let id = 0;
  const make = (subject: string, parents: string[]): CommitNode => ({
    oid: `o${++id}`,
    shortOid: `s${id}`,
    parents,
    author: "Perf",
    authoredAt: "2026-01-01T00:00:00Z",
    subject,
    refs: [],
  });
  const chronological: CommitNode[] = [];
  let main: string | null = null;
  let side: string | null = null;
  for (let i = 1; i <= total; i++) {
    if (i % 10 === 5 && main) {
      const s = make(`side ${i}`, [main]);
      chronological.push(s);
      side = s.oid;
    }
    const parents: string[] = main ? [main] : [];
    if (i % 10 === 0 && side) {
      parents.push(side);
      side = null;
    }
    const c = make(`commit ${i}`, parents);
    chronological.push(c);
    main = c.oid;
  }
  // Orden topológico (hijos antes que padres): el inverso del cronológico lo cumple.
  for (let i = chronological.length - 1; i >= 0; i--) commits.push(chronological[i]);
  return commits;
}

const ms = (t0: number) => (performance.now() - t0).toFixed(1);

describe.skipIf(!process.env.PERF)("rendimiento del grafo", () => {
  for (const total of [1_000, 10_000, 100_000]) {
    it(`${total} commits`, () => {
      const commits = syntheticHistory(total);

      let t0 = performance.now();
      const { rows } = computeGraphRows(commits);
      const layoutMs = ms(t0);

      t0 = performance.now();
      const { unmount } = render(
        <GraphView
          commits={commits}
          rows={rows}
          selectedOid={null}
          onSelect={() => {}}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => {}}
        />,
      );
      const mountMs = ms(t0);
      const mounted = screen.getAllByRole("option").length;

      const list = screen.getByRole("listbox");
      const steps = 200;
      t0 = performance.now();
      for (let i = 1; i <= steps; i++) {
        list.scrollTop = i * 28 * 7;
        fireEvent.scroll(list);
      }
      const perScroll = ((performance.now() - t0) / steps).toFixed(2);

      console.log(
        `PERF commits=${commits.length} layout=${layoutMs}ms montaje=${mountMs}ms ` +
          `filasDOM=${mounted} scroll=${perScroll}ms/evento maxLanes=${Math.max(...rows.map((r) => r.laneCount))}`,
      );
      expect(mounted).toBeLessThanOrEqual(100);
      unmount();
    });
  }
});
