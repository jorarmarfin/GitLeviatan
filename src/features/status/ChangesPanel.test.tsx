import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import type { RepositoryStatus } from "@/types/git";

import { ChangesPanel } from "./ChangesPanel";

vi.mock("@/features/diffs/MonacoDiff", () => ({
  default: ({ path, modified }: { path: string; modified: string }) => (
    <div data-testid="monaco" data-path={path}>
      {modified}
    </div>
  ),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      getStatus: vi.fn(),
      stageFiles: vi.fn(),
      unstageFiles: vi.fn(),
      createCommit: vi.fn(),
      getDiff: vi.fn(),
    },
  };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

const status: RepositoryStatus = {
  branch: "main",
  detachedHead: false,
  staged: [{ path: "listo.txt", origPath: null, kind: "added" }],
  unstaged: [{ path: "a.txt", origPath: null, kind: "modified" }],
  untracked: ["nuevo.txt"],
};

beforeEach(() => {
  vi.mocked(api.getStatus).mockReset().mockResolvedValue(status);
  vi.mocked(api.stageFiles).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.unstageFiles).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.createCommit)
    .mockReset()
    .mockResolvedValue({ oid: "a".repeat(40), shortOid: "aaaaaaa" });
  vi.mocked(api.getDiff).mockReset();
});

async function renderPanel(onCommitted = vi.fn()) {
  render(<ChangesPanel repository={repository} onCommitted={onCommitted} />);
  await screen.findByText("listo.txt");
  return onCommitted;
}

describe("ChangesPanel", () => {
  it("separa staged, unstaged y sin seguimiento", async () => {
    await renderPanel();
    expect(
      within(screen.getByRole("region", { name: "Staged" })).getByText("listo.txt"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Unstaged" })).getByText("a.txt"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Sin seguimiento" })).getByText("nuevo.txt"),
    ).toBeInTheDocument();
  });

  it("prepara un archivo y vuelve a leer el estado", async () => {
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Preparar a.txt" }));
    expect(api.stageFiles).toHaveBeenCalledWith("repo-1", ["a.txt"]);
    await vi.waitFor(() => expect(api.getStatus).toHaveBeenCalledTimes(2));
  });

  it("prepara un archivo sin seguimiento", async () => {
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Preparar nuevo.txt" }));
    expect(api.stageFiles).toHaveBeenCalledWith("repo-1", ["nuevo.txt"]);
  });

  it("quita de staged un renombrado con ambas rutas", async () => {
    vi.mocked(api.getStatus).mockResolvedValue({
      ...status,
      staged: [{ path: "nuevo.txt", origPath: "viejo.txt", kind: "renamed" }],
    });
    render(<ChangesPanel repository={repository} onCommitted={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Quitar de staged nuevo.txt" }),
    );
    expect(api.unstageFiles).toHaveBeenCalledWith("repo-1", ["nuevo.txt", "viejo.txt"]);
  });

  it("deshabilita Commit sin mensaje o sin cambios staged", async () => {
    await renderPanel();
    const commit = screen.getByRole("button", { name: /^commit/i });
    expect(commit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Mensaje de commit"), "  ");
    expect(commit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Mensaje de commit"), "Arregla algo");
    expect(commit).toBeEnabled();
  });

  it("no permite commit si no hay nada staged", async () => {
    vi.mocked(api.getStatus).mockResolvedValue({ ...status, staged: [] });
    render(<ChangesPanel repository={repository} onCommitted={vi.fn()} />);
    await screen.findByText("a.txt");
    await userEvent.type(screen.getByLabelText("Mensaje de commit"), "Mensaje");
    expect(screen.getByRole("button", { name: /^commit/i })).toBeDisabled();
  });

  it("crea el commit, limpia el mensaje y avisa para refrescar el historial", async () => {
    const onCommitted = await renderPanel();
    await userEvent.type(screen.getByLabelText("Mensaje de commit"), "Primer commit");
    await userEvent.click(screen.getByRole("button", { name: /^commit/i }));
    expect(api.createCommit).toHaveBeenCalledWith("repo-1", "Primer commit");
    await vi.waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Mensaje de commit")).toHaveValue("");
  });

  it("si falla un hook muestra su salida y conserva el mensaje", async () => {
    vi.mocked(api.createCommit).mockRejectedValue({
      kind: "command",
      message: "pre-commit hook failed",
      detail: "el hook rechazó el commit\nlínea 2",
    });
    const onCommitted = await renderPanel();
    await userEvent.type(screen.getByLabelText("Mensaje de commit"), "Intento");
    await userEvent.click(screen.getByRole("button", { name: /^commit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("pre-commit hook failed");
    expect(within(alert).getByText("Ver detalle técnico")).toBeInTheDocument();
    expect(alert).toHaveTextContent("el hook rechazó el commit");
    expect(screen.getByLabelText("Mensaje de commit")).toHaveValue("Intento");
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("muestra el diff del archivo seleccionado", async () => {
    vi.mocked(api.getDiff).mockResolvedValue({
      path: "a.txt",
      original: "uno",
      modified: "dos",
      isBinary: false,
      tooLarge: false,
    });
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /a\.txt/, pressed: false }));
    expect(await screen.findByTestId("monaco")).toHaveTextContent("dos");
    expect(api.getDiff).toHaveBeenCalledWith("repo-1", "a.txt", "unstaged");
  });
});
