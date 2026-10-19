import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";

import { MergeDialog } from "./MergeDialog";
import type { MergePreview } from "./types";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { ...original.api, mergePreview: vi.fn(), mergeBranch: vi.fn() } };
});

const repository = { id: "repo-1", path: "/tmp/r", name: "r" };

const preview = (extra: Partial<MergePreview> = {}): MergePreview => ({
  source: "feature",
  target: "main",
  commitsToMerge: 3,
  upToDate: false,
  fastForward: true,
  blocked: null,
  ...extra,
});

beforeEach(() => {
  vi.mocked(api.mergePreview).mockReset().mockResolvedValue(preview());
  vi.mocked(api.mergeBranch).mockReset();
});

async function renderDialog(source = "feature", onChanged = vi.fn(), onClose = vi.fn()) {
  render(
    <MergeDialog repository={repository} source={source} onChanged={onChanged} onClose={onClose} />,
  );
  return { onChanged, onClose, user: userEvent.setup() };
}

const dialog = () => screen.findByRole("dialog");

describe("MergeDialog: vista previa", () => {
  it("muestra origen y destino, los commits que entran y que bastará con avanzar la rama", async () => {
    await renderDialog();
    const d = await dialog();
    await within(d).findByText(/Entrarán/);
    expect(d).toHaveAccessibleName("Fusionar «feature» en «main»");
    expect(d).toHaveTextContent("Entrarán 3 commits de «feature» en «main»");
    expect(d).toHaveTextContent(
      "«main» solo avanzará hasta «feature»: no se creará un commit de fusión",
    );
    expect(d).toHaveTextContent(
      "Si hay conflictos, la fusión se cancelará sola y no se cambiará nada",
    );
    expect(api.mergePreview).toHaveBeenCalledWith("repo-1", "feature");
    expect(api.mergeBranch).not.toHaveBeenCalled();
  });

  it("avisa de que se creará un commit de fusión cuando las ramas han divergido", async () => {
    vi.mocked(api.mergePreview).mockResolvedValue(
      preview({ fastForward: false, commitsToMerge: 1 }),
    );
    await renderDialog();
    const d = await dialog();
    await within(d).findByText(/Entrarán/);
    expect(d).toHaveTextContent("Entrarán 1 commit de");
    expect(d).toHaveTextContent("Se creará un commit de fusión en «main»");
  });

  it("una rama ya incluida lo indica y no ofrece fusionar", async () => {
    vi.mocked(api.mergePreview).mockResolvedValue(preview({ upToDate: true, commitsToMerge: 0 }));
    await renderDialog();
    const d = await dialog();
    await within(d).findByText(/ya está incluida/);
    expect(d).toHaveTextContent("No hay nada que fusionar");
    expect(within(d).getByRole("button", { name: "Fusionar" })).toBeDisabled();
  });

  it("con HEAD desacoplado lo explica y bloquea la fusión", async () => {
    vi.mocked(api.mergePreview).mockResolvedValue(
      preview({ target: "HEAD", blocked: { reason: "detachedHead" } }),
    );
    await renderDialog();
    const d = await dialog();
    expect(await within(d).findByRole("alert")).toHaveTextContent("HEAD desacoplado");
    expect(within(d).getByRole("button", { name: "Fusionar" })).toBeDisabled();
  });

  it("con cambios locales los lista y bloquea la fusión", async () => {
    vi.mocked(api.mergePreview).mockResolvedValue(
      preview({ blocked: { reason: "localChanges", files: ["a.txt", "src/b.ts"] } }),
    );
    await renderDialog();
    const d = await dialog();
    const alert = await within(d).findByRole("alert");
    expect(alert).toHaveTextContent("a.txt, src/b.ts");
    expect(alert).toHaveTextContent("Confírmalos o descártalos");
    expect(within(d).getByRole("button", { name: "Fusionar" })).toBeDisabled();
  });

  it("una rama remota sugiere hacer fetch", async () => {
    vi.mocked(api.mergePreview).mockResolvedValue(preview({ source: "origin/main" }));
    await renderDialog("origin/main");
    expect(await screen.findByText(/haz Fetch antes de fusionar/)).toBeInTheDocument();
  });

  it("si no se puede preparar la fusión muestra el error con detalle técnico", async () => {
    vi.mocked(api.mergePreview).mockRejectedValue({
      kind: "validation",
      message: "La rama «x» no existe.",
      detail: "fatal: bad revision",
    });
    await renderDialog("x");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo preparar la fusión");
    expect(alert).toHaveTextContent("La rama «x» no existe.");
    expect(within(alert).getByText("Ver detalle técnico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fusionar" })).toBeDisabled();
  });

  it("el foco inicial está en Cancelar", async () => {
    await renderDialog();
    const d = await dialog();
    await within(d).findByText(/Entrarán/);
    expect(within(d).getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });
});

describe("MergeDialog: fusionar", () => {
  async function confirm() {
    const ctx = await renderDialog();
    const d = await dialog();
    await within(d).findByText(/Entrarán/);
    await ctx.user.click(within(d).getByRole("button", { name: "Fusionar" }));
    return { ...ctx, d };
  }

  it("avance rápido: informa, refresca y deja cerrar", async () => {
    vi.mocked(api.mergeBranch).mockResolvedValue({ status: "fastForward", oid: "abcdef1234567" });
    const { d, onChanged, user, onClose } = await confirm();

    expect(await within(d).findByRole("status")).toHaveTextContent("«main» avanzó hasta abcdef1");
    expect(api.mergeBranch).toHaveBeenCalledWith("repo-1", "feature");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(within(d).queryByRole("button", { name: "Fusionar" })).not.toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("commit de fusión: informa del commit creado y refresca", async () => {
    vi.mocked(api.mergeBranch).mockResolvedValue({ status: "merged", oid: "1234567890abc" });
    const { d, onChanged } = await confirm();
    expect(await within(d).findByRole("status")).toHaveTextContent(
      "Fusión completada: se creó el commit de fusión 1234567",
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("conflictos: informa de que se canceló, lista los archivos y no refresca", async () => {
    vi.mocked(api.mergeBranch).mockResolvedValue({ status: "conflict", files: ["a.txt", "b.txt"] });
    const { d, onChanged } = await confirm();

    const alert = await within(d).findByRole("alert");
    expect(alert).toHaveTextContent("La fusión tiene conflictos y se canceló. No se cambió nada.");
    expect(within(alert).getByText("a.txt")).toBeInTheDocument();
    expect(within(alert).getByText("b.txt")).toBeInTheDocument();
    expect(alert).toHaveTextContent("todavía no resuelve conflictos");
    expect(alert).toHaveTextContent("git merge feature");
    // Nada cambió: no hace falta refrescar.
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("ya incluida (carrera): informa y no refresca", async () => {
    vi.mocked(api.mergeBranch).mockResolvedValue({ status: "upToDate" });
    const { d, onChanged } = await confirm();
    expect(await within(d).findByRole("status")).toHaveTextContent("ya estaba incluida");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("un fallo se muestra con contexto y detalle técnico y permite reintentar", async () => {
    vi.mocked(api.mergeBranch)
      .mockRejectedValueOnce({
        kind: "git",
        message: "fatal: refusing to merge unrelated histories",
        detail: "fatal: refusing to merge unrelated histories",
      })
      .mockResolvedValueOnce({ status: "fastForward", oid: "abcdef1234567" });
    const { d, user, onChanged } = await confirm();

    const alert = await within(d).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo fusionar");
    expect(within(alert).getByText("Ver detalle técnico")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();

    await user.click(within(d).getByRole("button", { name: "Fusionar" }));
    expect(await within(d).findByRole("status")).toHaveTextContent("avanzó");
  });

  it("mientras fusiona no se puede cerrar ni con Esc ni con Cancelar", async () => {
    let finish: (r: { status: "merged"; oid: string }) => void = () => undefined;
    vi.mocked(api.mergeBranch).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { d, user, onClose } = await confirm();

    expect(within(d).getByRole("button", { name: "Fusionando…" })).toBeDisabled();
    expect(within(d).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    finish({ status: "merged", oid: "1234567890abc" });
    await within(d).findByRole("status");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancelar, Esc y el clic fuera cierran sin fusionar", async () => {
    const { user, onClose } = await renderDialog();
    const d = await dialog();
    await within(d).findByText(/Entrarán/);
    await user.click(within(d).getByRole("button", { name: "Cancelar" }));
    await user.keyboard("{Escape}");
    await user.click(d.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(api.mergeBranch).not.toHaveBeenCalled();
  });

  it("se opera solo con teclado: Tab hasta Fusionar y Enter", async () => {
    vi.mocked(api.mergeBranch).mockResolvedValue({ status: "merged", oid: "1234567890abc" });
    const { user } = await renderDialog();
    const d = await dialog();
    await within(d).findByText(/Entrarán/);
    await user.tab();
    expect(within(d).getByRole("button", { name: "Fusionar" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await within(d).findByRole("status")).toBeInTheDocument();
  });

  it("no usa diálogos nativos", async () => {
    vi.mocked(api.mergeBranch).mockResolvedValue({ status: "merged", oid: "1234567890abc" });
    const confirmSpy = vi.spyOn(window, "confirm");
    await confirm();
    await waitFor(() => expect(api.mergeBranch).toHaveBeenCalled());
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
