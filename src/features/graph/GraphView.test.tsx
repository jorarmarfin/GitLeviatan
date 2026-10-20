import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CommitNode } from "@/types/git";

import { GraphView } from "./GraphView";
import { computeGraphRows } from "./layout";

function makeCommits(total: number): CommitNode[] {
  const commits: CommitNode[] = [];
  for (let i = total; i >= 1; i--) {
    commits.push({
      oid: `oid${i}`,
      shortOid: `s${i}`,
      parents: i > 1 ? [`oid${i - 1}`] : [],
      author: "Ana",
      authoredAt: "2026-01-02T03:04:05+00:00",
      subject: `Commit ${i}`,
      refs: [],
    });
  }
  return commits;
}

function Harness({
  commits,
  onSelectSpy,
  onOpen,
  onContextMenu,
}: {
  commits: CommitNode[];
  onSelectSpy?: () => void;
  onOpen?: (oid: string) => void;
  onContextMenu?: (oid: string, position: { x: number; y: number }) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { rows } = computeGraphRows(commits);
  return (
    <>
      <GraphView
        commits={commits}
        rows={rows}
        selectedOid={selected}
        onSelect={(oid) => {
          onSelectSpy?.();
          setSelected(oid);
        }}
        onOpen={onOpen}
        onContextMenu={onContextMenu}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
      />
      <output data-testid="selected">{selected}</output>
    </>
  );
}

describe("GraphView", () => {
  it("con 10 000 commits monta como máximo 100 filas", () => {
    render(<Harness commits={makeCommits(10_000)} />);
    const rows = screen.getAllByRole("option");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(100);
  });

  it("las flechas cambian la selección", async () => {
    render(<Harness commits={makeCommits(20)} />);
    await userEvent.click(screen.getByRole("listbox"));
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByTestId("selected")).toHaveTextContent("oid20");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByTestId("selected")).toHaveTextContent("oid18");
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByTestId("selected")).toHaveTextContent("oid19");
    await userEvent.keyboard("{End}");
    expect(screen.getByTestId("selected")).toHaveTextContent("oid1");
    await userEvent.keyboard("{Home}");
    expect(screen.getByTestId("selected")).toHaveTextContent("oid20");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Commit 20");
    expect(screen.getByRole("option", { selected: true })).toHaveClass("bg-selected");
  });

  it("RePág y AvPág mueven la selección por páginas", async () => {
    render(<Harness commits={makeCommits(200)} />);
    await userEvent.click(screen.getByRole("listbox"));
    await userEvent.keyboard("{Home}{PageDown}");
    const afterDown = screen.getByTestId("selected").textContent ?? "";
    expect(Number(afterDown.replace("oid", ""))).toBeLessThan(200 - 5);
    await userEvent.keyboard("{PageUp}");
    expect(screen.getByTestId("selected")).toHaveTextContent("oid200");
  });

  it("es alcanzable con Tab y expone el historial como lista con nombre", async () => {
    render(<Harness commits={makeCommits(5)} />);
    await userEvent.tab();
    expect(screen.getByRole("listbox", { name: "Historial de commits" })).toHaveFocus();
  });

  it("al hacer clic en una fila la selecciona", async () => {
    const spy = vi.fn();
    render(<Harness commits={makeCommits(5)} onSelectSpy={spy} />);
    await userEvent.click(screen.getByRole("option", { name: /Commit 3/ }));
    expect(screen.getByTestId("selected")).toHaveTextContent("oid3");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("muestra las etiquetas de referencias en el commit correcto", () => {
    const commits = makeCommits(3);
    commits[0].refs = ["HEAD -> refs/heads/main", "refs/remotes/origin/main", "tag: refs/tags/v1"];
    commits[2].refs = ["refs/heads/feature/x"];
    render(<Harness commits={commits} />);
    const top = screen.getByRole("option", { name: /Commit 3/ });
    expect(top.querySelector('[data-ref-kind="head"]')).toHaveTextContent("main");
    expect(top.querySelector('[data-ref-kind="remote"]')).toHaveTextContent("origin/main");
    expect(top.querySelector('[data-ref-kind="tag"]')).toHaveTextContent("v1");
    const bottom = screen.getByRole("option", { name: /Commit 1/ });
    expect(bottom.querySelector('[data-ref-kind="local"]')).toHaveTextContent("feature/x");
    expect(bottom.querySelector('[data-ref-kind="head"]')).toBeNull();
  });

  it("dibuja una arista por cada padre de un merge", () => {
    const commits: CommitNode[] = [
      {
        oid: "m",
        shortOid: "m",
        parents: ["a", "b"],
        author: "x",
        authoredAt: "2026-01-01T00:00:00Z",
        subject: "Merge",
        refs: [],
      },
      {
        oid: "a",
        shortOid: "a",
        parents: ["r"],
        author: "x",
        authoredAt: "2026-01-01T00:00:00Z",
        subject: "A",
        refs: [],
      },
      {
        oid: "b",
        shortOid: "b",
        parents: ["r"],
        author: "x",
        authoredAt: "2026-01-01T00:00:00Z",
        subject: "B",
        refs: [],
      },
      {
        oid: "r",
        shortOid: "r",
        parents: [],
        author: "x",
        authoredAt: "2026-01-01T00:00:00Z",
        subject: "R",
        refs: [],
      },
    ];
    render(<Harness commits={commits} />);
    const merge = screen.getByRole("option", { name: /Merge/ });
    expect(merge.querySelectorAll("svg path")).toHaveLength(2);
    expect(merge.querySelectorAll("svg circle")).toHaveLength(1);
  });

  it("el doble clic abre los archivos del commit", async () => {
    const onOpen = vi.fn();
    render(<Harness commits={makeCommits(5)} onOpen={onOpen} />);
    await userEvent.dblClick(screen.getByRole("option", { name: /Commit 4/ }));
    expect(onOpen).toHaveBeenCalledWith("oid4");
    expect(screen.getByTestId("selected")).toHaveTextContent("oid4");
  });

  it("Enter abre los archivos del commit seleccionado y no hace nada sin selección", async () => {
    const onOpen = vi.fn();
    render(<Harness commits={makeCommits(5)} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("listbox"));
    await userEvent.keyboard("{Enter}");
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(screen.getByTestId("selected").textContent);
  });

  it("el clic simple y las flechas no abren nada", async () => {
    const onOpen = vi.fn();
    render(<Harness commits={makeCommits(5)} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("option", { name: /Commit 3/ }));
    await userEvent.keyboard("{ArrowDown}");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("el clic derecho selecciona el commit y avisa con la posición del puntero", async () => {
    const onContextMenu = vi.fn();
    render(<Harness commits={makeCommits(5)} onContextMenu={onContextMenu} />);
    await userEvent.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("option", { name: /Commit 3/ }),
    });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu).toHaveBeenCalledWith("oid3", expect.objectContaining({ x: 0, y: 0 }));
    expect(screen.getByTestId("selected")).toHaveTextContent("oid3");
  });

  it("la tecla de menú abre el menú del commit seleccionado", async () => {
    const onContextMenu = vi.fn();
    render(<Harness commits={makeCommits(5)} onContextMenu={onContextMenu} />);
    await userEvent.click(screen.getByRole("option", { name: /Commit 4/ }));
    onContextMenu.mockClear();
    // Con el teclado el evento llega al listbox, no a una fila.
    screen
      .getByRole("listbox")
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(onContextMenu).toHaveBeenCalledWith("oid4", expect.any(Object));
  });

  it("sin manejador no intercepta el menú del navegador", () => {
    render(<Harness commits={makeCommits(3)} />);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("option", { name: /Commit 2/ }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
