// Dos partes:
// - «umbrales»: corre siempre (también en CI) y compara con tests/perf/thresholds.json.
// - «rendimiento del grafo»: medición manual con `PERF=1 pnpm vitest run
//   src/features/graph/perf.test.tsx --silent=false`; los resultados van a docs/performance.md.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import thresholds from "../../../tests/perf/thresholds.json";
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

function mountGraph(commits: CommitNode[], rows: ReturnType<typeof computeGraphRows>["rows"]) {
  return render(
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
}

/** Mejor de 3 intentos: el ruido del CI no debe dar falsos positivos. */
function best(work: () => void): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    work();
    min = Math.min(min, performance.now() - t0);
  }
  return min;
}

describe("umbrales de rendimiento (tests/perf/thresholds.json)", () => {
  const commits = syntheticHistory(100_000);

  it("el layout, el montaje y el scroll del grafo respetan los umbrales", () => {
    const layout = best(() => void computeGraphRows(commits));
    const { rows } = computeGraphRows(commits);

    const mount = best(() => mountGraph(commits, rows).unmount());

    const { unmount } = mountGraph(commits, rows);
    const list = screen.getByRole("listbox");
    const steps = 200;
    const scroll =
      best(() => {
        for (let i = 1; i <= steps; i++) {
          list.scrollTop = i * 28 * 7;
          fireEvent.scroll(list);
        }
      }) / steps;
    unmount();

    console.info(
      `PERF umbrales layout=${layout.toFixed(1)}ms montaje=${mount.toFixed(1)}ms scroll=${scroll.toFixed(2)}ms/evento`,
    );
    expect(layout).toBeLessThanOrEqual(thresholds.frontend_layout_110k.maxMs);
    expect(mount).toBeLessThanOrEqual(thresholds.frontend_mount_110k.maxMs);
    expect(scroll).toBeLessThanOrEqual(thresholds.frontend_scroll_event.maxMs);
  }, 60_000);
});

describe.skipIf(!process.env.PERF)("rendimiento del grafo", () => {
  for (const total of [1_000, 10_000, 100_000]) {
    it(`${total} commits`, () => {
      const commits = syntheticHistory(total);

      let t0 = performance.now();
      const { rows } = computeGraphRows(commits);
      const layoutMs = ms(t0);

      t0 = performance.now();
      const { unmount } = mountGraph(commits, rows);
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
