import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommitList } from "@/features/commits/CommitList";
import { api } from "@/lib/api";
import type { CommitNode } from "@/types/git";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, listCommits: vi.fn() } };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

function commit(n: number): CommitNode {
  return {
    oid: `oid${n}`,
    shortOid: `s${n}`,
    parents: [],
    author: "Ana",
    authoredAt: "2026-01-02T03:04:05+00:00",
    subject: `Commit ${n}`,
    refs: [],
  };
}

beforeEach(() => {
  vi.mocked(api.listCommits).mockReset();
});

describe("CommitList", () => {
  it("muestra el estado de repositorio vacío", async () => {
    vi.mocked(api.listCommits).mockResolvedValue({ commits: [], nextCursor: null });
    render(<CommitList repository={repository} />);
    expect(await screen.findByText(/repositorio vacío/i)).toBeInTheDocument();
  });

  it("muestra el error de Git sin reemplazarlo por uno genérico", async () => {
    vi.mocked(api.listCommits).mockRejectedValue({
      kind: "command",
      message: "boom",
      detail: null,
    });
    render(<CommitList repository={repository} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });

  it("carga la página siguiente al pulsar Cargar más", async () => {
    vi.mocked(api.listCommits)
      .mockResolvedValueOnce({ commits: [commit(2), commit(1)], nextCursor: "2" })
      .mockResolvedValueOnce({ commits: [commit(0)], nextCursor: null });
    render(<CommitList repository={repository} />);
    await screen.findByText("Commit 2");
    await userEvent.click(screen.getByRole("button", { name: /cargar más/i }));
    expect(await screen.findByText("Commit 0")).toBeInTheDocument();
    expect(api.listCommits).toHaveBeenLastCalledWith("repo-1", "2", 100);
    expect(screen.queryByRole("button", { name: /cargar más/i })).not.toBeInTheDocument();
  });
});
