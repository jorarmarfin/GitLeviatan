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
      stageAll: vi.fn(),
      unstageAll: vi.fn(),
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
  vi.mocked(api.stageAll).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.unstageAll).mockReset().mockResolvedValue(undefined);
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

  describe("color por tipo de cambio", () => {
    it("cada tipo conserva su texto y lleva su color", async () => {
      vi.mocked(api.getStatus).mockResolvedValue({
        ...status,
        staged: [
          { path: "listo.txt", origPath: null, kind: "added" },
          { path: "viejo.txt", origPath: null, kind: "deleted" },
          { path: "nombre.txt", origPath: "antes.txt", kind: "renamed" },
        ],
        unstaged: [{ path: "a.txt", origPath: null, kind: "modified" }],
      });
      render(<ChangesPanel repository={repository} onCommitted={vi.fn()} />);
      await screen.findByText("listo.txt");

      // El texto del tipo siempre está: el color nunca es la única señal.
      expect(screen.getByText("added")).toHaveClass("text-change-added");
      expect(screen.getByText("deleted")).toHaveClass("text-change-deleted");
      expect(screen.getByText("renamed")).toHaveClass("text-change-renamed");
      expect(screen.getByText("modified")).toHaveClass("text-change-modified");
      expect(screen.getByText("untracked")).toHaveClass("text-change-untracked");
    });

    it("las cabeceras muestran el contador como etiqueta", async () => {
      await renderPanel();
      const staged = screen.getByRole("region", { name: "Staged" });
      expect(within(staged).getByRole("heading", { name: /Staged/ })).toBeInTheDocument();
      expect(within(staged).getByLabelText("1 archivos")).toHaveTextContent("1");
      const untracked = screen.getByRole("region", { name: "Sin seguimiento" });
      expect(within(untracked).getByLabelText("1 archivos")).toBeInTheDocument();
    });

    it("el archivo seleccionado usa el color de selección", async () => {
      vi.mocked(api.getDiff).mockResolvedValue({
        path: "a.txt",
        original: "x",
        modified: "y",
        isBinary: false,
        tooLarge: false,
      });
      await renderPanel();
      await userEvent.click(screen.getByTitle("a.txt"));
      expect(screen.getByTitle("a.txt")).toHaveClass("aria-pressed:bg-selected");
      expect(screen.getByTitle("a.txt")).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("preparar y quitar todo", () => {
    it("Preparar todo llama a stageAll y vuelve a leer el estado", async () => {
      await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Preparar todo" }));
      expect(api.stageAll).toHaveBeenCalledWith("repo-1");
      expect(api.stageFiles).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(api.getStatus).toHaveBeenCalledTimes(2));
    });

    it("Quitar todo llama a unstageAll", async () => {
      await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Quitar todo" }));
      expect(api.unstageAll).toHaveBeenCalledWith("repo-1");
      await vi.waitFor(() => expect(api.getStatus).toHaveBeenCalledTimes(2));
    });

    it("solo muestra cada botón cuando hay algo que hacer", async () => {
      vi.mocked(api.getStatus).mockResolvedValue({ ...status, staged: [] });
      render(<ChangesPanel repository={repository} onCommitted={vi.fn()} />);
      await screen.findByText("a.txt");
      expect(screen.getByRole("button", { name: "Preparar todo" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Quitar todo" })).not.toBeInTheDocument();
    });

    it("sin cambios sin preparar ni archivos nuevos no ofrece Preparar todo", async () => {
      vi.mocked(api.getStatus).mockResolvedValue({ ...status, unstaged: [], untracked: [] });
      await renderPanel();
      expect(screen.queryByRole("button", { name: "Preparar todo" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Quitar todo" })).toBeInTheDocument();
    });

    it("se deshabilitan mientras hay otra operación en curso", async () => {
      let finish: () => void = () => undefined;
      vi.mocked(api.stageAll).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
      await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Preparar todo" }));

      expect(screen.getByRole("button", { name: "Preparar todo" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Quitar todo" })).toBeDisabled();
      finish();
      await vi.waitFor(() =>
        expect(screen.getByRole("button", { name: "Preparar todo" })).toBeEnabled(),
      );
    });

    it("se alcanzan con Tab y se activan con Enter y con Espacio", async () => {
      await renderPanel();
      const user = userEvent.setup();
      const prepare = screen.getByRole("button", { name: "Preparar todo" });
      await user.tab();
      expect(prepare).toHaveFocus();
      await user.keyboard("{Enter}");
      await vi.waitFor(() => expect(api.stageAll).toHaveBeenCalledTimes(1));

      const remove = screen.getByRole("button", { name: "Quitar todo" });
      remove.focus();
      await user.keyboard(" ");
      await vi.waitFor(() => expect(api.unstageAll).toHaveBeenCalledTimes(1));
    });

    it("un fallo de Git se muestra con contexto y detalle técnico", async () => {
      vi.mocked(api.stageAll).mockRejectedValue({
        kind: "git",
        message: "fatal: Unable to create index.lock",
        detail: "fatal: Unable to create index.lock: File exists.",
      });
      await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Preparar todo" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("No se pudo preparar todo");
      expect(alert).toHaveTextContent("index.lock");
      expect(within(alert).getByText("Ver detalle técnico")).toBeInTheDocument();
    });
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

  it("Ctrl+Enter en el mensaje crea el commit (solo con staged y mensaje)", async () => {
    const onCommitted = await renderPanel();
    const box = screen.getByLabelText("Mensaje de commit");
    await userEvent.click(box);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(api.createCommit).not.toHaveBeenCalled();

    await userEvent.type(box, "Con teclado");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(api.createCommit).toHaveBeenCalledWith("repo-1", "Con teclado");
    await vi.waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
  });

  it("si falla un hook muestra su salida y conserva el mensaje", async () => {
    vi.mocked(api.createCommit).mockRejectedValue({
      kind: "git",
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
