import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { api } from "@/lib/api";
import type { FileDiff } from "@/types/git";

import { DiffViewer } from "./DiffViewer";

vi.mock("./MonacoDiff", () => ({
  default: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="monaco">
      {original}→{modified}
    </div>
  ),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, getDiff: vi.fn() } };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };
const selection = { path: "a.txt", scope: "unstaged" as const };
const base: FileDiff = {
  path: "a.txt",
  original: "",
  modified: "",
  isBinary: false,
  tooLarge: false,
};

beforeEach(() => {
  vi.mocked(api.getDiff).mockReset();
});

describe("DiffViewer", () => {
  it("pide seleccionar un archivo si no hay selección", () => {
    render(<DiffViewer repository={repository} selection={null} refreshKey={0} />);
    expect(screen.getByText(/selecciona un archivo/i)).toBeInTheDocument();
    expect(api.getDiff).not.toHaveBeenCalled();
  });

  it("muestra original y modificado en el visor", async () => {
    vi.mocked(api.getDiff).mockResolvedValue({ ...base, original: "uno", modified: "dos" });
    render(<DiffViewer repository={repository} selection={selection} refreshKey={0} />);
    expect(await screen.findByTestId("monaco")).toHaveTextContent("uno→dos");
  });

  it("avisa de un archivo binario sin renderizar el visor", async () => {
    vi.mocked(api.getDiff).mockResolvedValue({ ...base, isBinary: true });
    render(<DiffViewer repository={repository} selection={selection} refreshKey={0} />);
    expect(await screen.findByText(/archivo binario/i)).toBeInTheDocument();
    expect(screen.queryByTestId("monaco")).not.toBeInTheDocument();
  });

  it("avisa de un archivo de más de 1 MiB sin renderizar el visor", async () => {
    vi.mocked(api.getDiff).mockResolvedValue({ ...base, tooLarge: true });
    render(<DiffViewer repository={repository} selection={selection} refreshKey={0} />);
    expect(await screen.findByText(/supera 1 MiB/i)).toBeInTheDocument();
    expect(screen.queryByTestId("monaco")).not.toBeInTheDocument();
  });

  it("muestra el error de Git", async () => {
    vi.mocked(api.getDiff).mockRejectedValue({ kind: "command", message: "boom", detail: null });
    render(<DiffViewer repository={repository} selection={selection} refreshKey={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
