import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";

import { BranchesPanel } from "./BranchesPanel";
import type { BranchInfo } from "./types";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      listBranches: vi.fn(),
      createBranch: vi.fn(),
      checkoutBranch: vi.fn(),
      deleteBranch: vi.fn(),
      mergePreview: vi.fn(),
      mergeBranch: vi.fn(),
    },
  };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

const branch = (over: Partial<BranchInfo>): BranchInfo => ({
  name: "x",
  kind: "local",
  isCurrent: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  tipOid: "a".repeat(40),
  ...over,
});

const branches: BranchInfo[] = [
  branch({ name: "main", isCurrent: true, upstream: "origin/main", ahead: 2, behind: 1 }),
  branch({ name: "feature/login", tipOid: "b".repeat(40) }),
  branch({ name: "origin/main", kind: "remote" }),
  branch({ name: "origin/feature", kind: "remote" }),
];

beforeEach(() => {
  vi.mocked(api.listBranches).mockReset().mockResolvedValue(branches);
  vi.mocked(api.createBranch).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.checkoutBranch).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.deleteBranch).mockReset().mockResolvedValue({ status: "deleted" });
  vi.mocked(api.mergePreview).mockReset().mockResolvedValue({
    source: "feature/login",
    target: "main",
    commitsToMerge: 2,
    upToDate: false,
    fastForward: true,
    blocked: null,
  });
  vi.mocked(api.mergeBranch)
    .mockReset()
    .mockResolvedValue({ status: "fastForward", oid: "abcdef1234567" });
});

async function renderPanel(selectedOid: string | null = null) {
  const onChanged = vi.fn();
  render(
    <BranchesPanel
      repository={repository}
      selectedOid={selectedOid}
      externalVersion={0}
      onChanged={onChanged}
    />,
  );
  await screen.findByRole("list", { name: "Ramas locales" });
  return onChanged;
}

describe("BranchesPanel", () => {
  it("lista ramas locales y remotas, y marca la actual", async () => {
    await renderPanel();
    const locals = within(screen.getByRole("list", { name: "Ramas locales" }));
    const remotes = within(screen.getByRole("list", { name: "Ramas remotas" }));
    expect(locals.getByRole("button", { name: "main" })).toHaveAttribute("aria-current", "true");
    expect(locals.getByRole("button", { name: "feature/login" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(remotes.getByRole("button", { name: "origin/main" })).toBeInTheDocument();
    expect(remotes.getByRole("button", { name: "origin/feature" })).toBeInTheDocument();
  });

  it("no marca ninguna rama como actual en detached HEAD", async () => {
    vi.mocked(api.listBranches).mockResolvedValue(
      branches.map((b) => ({ ...b, isCurrent: false })),
    );
    await renderPanel();
    expect(document.querySelector('[aria-current="true"]')).toBeNull();
  });

  it("muestra ahead/behind respecto al upstream", async () => {
    await renderPanel();
    expect(screen.getByTitle(/Respecto a origin\/main/)).toHaveTextContent("↑2 ↓1");
  });

  it("cambia de rama y avisa para refrescar", async () => {
    const onChanged = await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "feature/login" }));
    expect(api.checkoutBranch).toHaveBeenCalledWith("repo-1", "feature/login");
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("hacer checkout de una remota usa su nombre completo", async () => {
    await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "origin/feature" }));
    expect(api.checkoutBranch).toHaveBeenCalledWith("repo-1", "origin/feature");
  });

  it("si el cambio de rama falla muestra el error de Git y no refresca", async () => {
    vi.mocked(api.checkoutBranch).mockRejectedValue({
      kind: "command",
      message: "Tienes cambios locales que se perderían",
      detail: "error: Your local changes would be overwritten by checkout",
    });
    const onChanged = await renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "feature/login" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tienes cambios locales");
    expect(alert).toHaveTextContent("would be overwritten");
    expect(onChanged).not.toHaveBeenCalled();
  });

  describe("crear", () => {
    it("crea desde HEAD", async () => {
      const onChanged = await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Crear rama" }));
      const dialog = screen.getByRole("dialog", { name: "Crear rama" });
      await userEvent.type(within(dialog).getByLabelText("Nombre de la rama"), "nueva");
      await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
      expect(api.createBranch).toHaveBeenCalledWith("repo-1", "nueva", null);
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it("crea desde el commit seleccionado", async () => {
      await renderPanel("c".repeat(40));
      await userEvent.click(screen.getByRole("button", { name: "Crear rama" }));
      const dialog = screen.getByRole("dialog");
      await userEvent.click(
        within(dialog).getByLabelText(/Desde el commit seleccionado \(ccccccc\)/),
      );
      await userEvent.type(within(dialog).getByLabelText("Nombre de la rama"), "desde-commit");
      await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
      expect(api.createBranch).toHaveBeenCalledWith("repo-1", "desde-commit", "c".repeat(40));
    });

    it("con un nombre inválido muestra el motivo y deja el diálogo abierto", async () => {
      vi.mocked(api.createBranch).mockRejectedValue({
        kind: "invalidInput",
        message: "«a b» no es un nombre de rama válido para Git.",
        detail: null,
      });
      const onChanged = await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Crear rama" }));
      const dialog = screen.getByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Nombre de la rama"), "a b");
      await userEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "no es un nombre de rama válido",
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it("no permite enviar un nombre vacío", async () => {
      await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Crear rama" }));
      expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();
    });

    it("Escape cierra el diálogo sin crear nada", async () => {
      await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Crear rama" }));
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(api.createBranch).not.toHaveBeenCalled();
    });
  });

  describe("eliminar", () => {
    it("no permite eliminar la rama actual", async () => {
      await renderPanel();
      expect(screen.getByRole("button", { name: "Eliminar rama main" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Eliminar rama feature/login" })).toBeEnabled();
    });

    it("una rama fusionada pide una sola confirmación", async () => {
      const onChanged = await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Eliminar rama feature/login" }));
      const dialog = screen.getByRole("dialog", { name: "Eliminar rama" });
      expect(api.deleteBranch).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
      expect(api.deleteBranch).toHaveBeenCalledTimes(1);
      expect(api.deleteBranch).toHaveBeenCalledWith("repo-1", "feature/login", false);
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it("una rama sin fusionar pide una segunda confirmación con el riesgo", async () => {
      vi.mocked(api.deleteBranch)
        .mockResolvedValueOnce({ status: "needsForce", reason: "notMerged" })
        .mockResolvedValueOnce({ status: "deleted" });
      const onChanged = await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Eliminar rama feature/login" }));
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }),
      );

      const second = await screen.findByRole("dialog", { name: "Rama sin fusionar" });
      expect(second).toHaveTextContent("dejarán de ser alcanzables");
      expect(second).toHaveTextContent("bbbbbbb"); // oid corto de la punta
      expect(second).toHaveTextContent("git reflog");
      expect(onChanged).not.toHaveBeenCalled(); // aún no se borró nada

      await userEvent.click(
        within(second).getByRole("button", { name: "Eliminar de todos modos" }),
      );
      expect(api.deleteBranch).toHaveBeenLastCalledWith("repo-1", "feature/login", true);
      await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it("cancelar la segunda confirmación no elimina la rama", async () => {
      vi.mocked(api.deleteBranch).mockResolvedValue({ status: "needsForce", reason: "notMerged" });
      await renderPanel();
      await userEvent.click(screen.getByRole("button", { name: "Eliminar rama feature/login" }));
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }),
      );
      const second = await screen.findByRole("dialog", { name: "Rama sin fusionar" });
      await userEvent.click(within(second).getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(api.deleteBranch).toHaveBeenCalledTimes(1);
    });
  });

  it("vuelve a leer las ramas cuando cambia la versión externa", async () => {
    const { rerender } = render(
      <BranchesPanel
        repository={repository}
        selectedOid={null}
        externalVersion={0}
        onChanged={() => {}}
      />,
    );
    await screen.findByRole("list", { name: "Ramas locales" });
    rerender(
      <BranchesPanel
        repository={repository}
        selectedOid={null}
        externalVersion={1}
        onChanged={() => {}}
      />,
    );
    await vi.waitFor(() => expect(api.listBranches).toHaveBeenCalledTimes(2));
  });
});

describe("BranchesPanel: fusionar", () => {
  it("ofrece Fusionar en las ramas locales y remotas, menos en la actual", async () => {
    await renderPanel();
    const locals = within(screen.getByRole("list", { name: "Ramas locales" }));
    const remotes = within(screen.getByRole("list", { name: "Ramas remotas" }));

    expect(
      locals.getByRole("button", { name: "Fusionar «main» en la rama actual" }),
    ).toBeDisabled();
    expect(
      locals.getByRole("button", { name: "Fusionar «feature/login» en la rama actual" }),
    ).toBeEnabled();
    expect(
      remotes.getByRole("button", { name: "Fusionar «origin/feature» en la rama actual" }),
    ).toBeEnabled();
  });

  it("abre la vista previa, fusiona y avisa para refrescar", async () => {
    const onChanged = await renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: "Fusionar «feature/login» en la rama actual" }),
    );

    const dialog = await screen.findByRole("dialog", { name: /Fusionar «feature\/login»/ });
    await within(dialog).findByText(/Entrarán/);
    expect(dialog).toHaveTextContent("Entrarán 2 commits");
    expect(api.mergePreview).toHaveBeenCalledWith("repo-1", "feature/login");
    // Abrir la vista previa no cambia nada todavía.
    expect(api.mergeBranch).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Fusionar" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent("avanzó");
    expect(api.mergeBranch).toHaveBeenCalledWith("repo-1", "feature/login");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("también se puede fusionar una rama remota", async () => {
    await renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: "Fusionar «origin/feature» en la rama actual" }),
    );
    await screen.findByRole("dialog");
    expect(api.mergePreview).toHaveBeenCalledWith("repo-1", "origin/feature");
  });

  it("Cancelar cierra el diálogo sin fusionar", async () => {
    const onChanged = await renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: "Fusionar «feature/login» en la rama actual" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.mergeBranch).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
