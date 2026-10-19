import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { api } from "@/lib/api";
import type { CommitNode } from "@/types/git";

import { GraphPanel } from "./GraphPanel";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, listCommits: vi.fn() } };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

function commit(n: number): CommitNode {
  return {
    oid: `oid${n}`,
    shortOid: `s${n}`,
    parents: n > 1 ? [`oid${n - 1}`] : [],
    author: "Ana",
    authoredAt: "2026-01-02T03:04:05+00:00",
    subject: `Commit ${n}`,
    refs: [],
  };
}

beforeEach(() => {
  vi.mocked(api.listCommits).mockReset();
});

describe("GraphPanel", () => {
  it("muestra el estado de repositorio vacío", async () => {
    vi.mocked(api.listCommits).mockResolvedValue({ commits: [], nextCursor: null });
    render(<GraphPanel repository={repository} selectedOid={null} onSelect={() => {}} />);
    expect(await screen.findByText(/repositorio vacío/i)).toBeInTheDocument();
  });

  it("muestra el error de Git", async () => {
    vi.mocked(api.listCommits).mockRejectedValue({
      kind: "command",
      message: "boom",
      detail: null,
    });
    render(<GraphPanel repository={repository} selectedOid={null} onSelect={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });

  it("pide páginas de 500 y carga la siguiente cuando hay más", async () => {
    vi.mocked(api.listCommits)
      .mockResolvedValueOnce({ commits: [commit(3), commit(2)], nextCursor: "2" })
      .mockResolvedValueOnce({ commits: [commit(1)], nextCursor: null });
    render(<GraphPanel repository={repository} selectedOid={null} onSelect={() => {}} />);
    // Con tan pocas filas el final ya está a la vista: carga la segunda página sola.
    expect(await screen.findByRole("option", { name: /Commit 1/ })).toBeInTheDocument();
    expect(api.listCommits).toHaveBeenNthCalledWith(1, "repo-1", null, 500);
    expect(api.listCommits).toHaveBeenNthCalledWith(2, "repo-1", "2", 500);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });
});
