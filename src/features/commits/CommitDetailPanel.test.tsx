import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CommitDetail } from "@/features/graph/types";
import { api } from "@/lib/api";

import { CommitDetailPanel } from "./CommitDetailPanel";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, getCommit: vi.fn() } };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

const detail: CommitDetail = {
  oid: "a".repeat(40),
  shortOid: "aaaaaaa",
  parents: ["b".repeat(40)],
  author: "Ana",
  authoredAt: "2026-01-02T03:04:05+00:00",
  subject: "Arregla <script>alert(1)</script>",
  refs: ["HEAD -> refs/heads/main"],
  body: "Cuerpo con <img src=x onerror=alert(1)> y <b>negrita</b>",
  committer: "Luis",
  committedAt: "2026-01-03T00:00:00+00:00",
};

beforeEach(() => {
  vi.mocked(api.getCommit).mockReset();
});

describe("CommitDetailPanel", () => {
  it("muestra el cuerpo y el asunto como texto, aunque contengan HTML", async () => {
    vi.mocked(api.getCommit).mockResolvedValue(detail);
    const { container } = render(<CommitDetailPanel repository={repository} oid={detail.oid} />);
    expect(await screen.findByText(/<b>negrita<\/b>/)).toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveTextContent("<script>alert(1)</script>");
    expect(container.querySelector("script, img, b")).toBeNull();
    expect(api.getCommit).toHaveBeenCalledWith("repo-1", detail.oid);
  });

  it("muestra el error de Git", async () => {
    vi.mocked(api.getCommit).mockRejectedValue({
      kind: "command",
      message: "no existe",
      detail: null,
    });
    render(<CommitDetailPanel repository={repository} oid="abcd" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("no existe");
  });

  it("ofrece crear una rama o un tag en este commit", async () => {
    vi.mocked(api.getCommit).mockResolvedValue(detail);
    const onCreateBranch = vi.fn();
    const onCreateTag = vi.fn();
    render(
      <CommitDetailPanel
        repository={repository}
        oid={detail.oid}
        onCreateBranch={onCreateBranch}
        onCreateTag={onCreateTag}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Crear rama aquí" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear tag aquí" }));
    expect(onCreateBranch).toHaveBeenCalledWith(detail.oid);
    expect(onCreateTag).toHaveBeenCalledWith(detail.oid);
  });

  it("sin acciones no muestra botones", async () => {
    vi.mocked(api.getCommit).mockResolvedValue(detail);
    render(<CommitDetailPanel repository={repository} oid={detail.oid} />);
    await screen.findByText(/negrita/);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
