import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";
import type { RecentRepository } from "@/types/git";

import { RecentRepositories } from "./RecentRepositories";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      listRecentRepositories: vi.fn(),
      removeRecentRepository: vi.fn(),
      openRepository: vi.fn(),
    },
  };
});

const entry = (name: string): RecentRepository => ({
  path: `/home/ana/${name}`,
  name,
  lastOpenedAt: "2026-10-19T00:00:00Z",
});

let stored: RecentRepository[];

beforeEach(() => {
  stored = [entry("uno"), entry("dos")];
  vi.mocked(api.listRecentRepositories)
    .mockReset()
    .mockImplementation(async () => stored);
  vi.mocked(api.removeRecentRepository)
    .mockReset()
    .mockImplementation(async (path) => {
      stored = stored.filter((r) => r.path !== path);
    });
  vi.mocked(api.openRepository)
    .mockReset()
    .mockResolvedValue({ id: "repo-1", path: "/x", name: "x" });
  useRepositoryStore.setState({
    active: null,
    recents: [],
    opening: false,
    error: null,
    syncRunning: false,
  });
});

/** Pulsa la × de un proyecto y confirma en el modal. */
async function removeWithConfirmation(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: `Quitar ${name} de recientes` }));
  const dialog = await screen.findByRole("dialog", { name: "Quitar de recientes" });
  await user.click(within(dialog).getByRole("button", { name: "Quitar" }));
}

describe("RecentRepositories: quitar de recientes", () => {
  it("cada proyecto tiene un botón con su nombre accesible", async () => {
    render(<RecentRepositories />);
    expect(
      await screen.findByRole("button", { name: "Quitar uno de recientes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar dos de recientes" })).toBeInTheDocument();
  });

  it("quitarlo (confirmando) lo elimina de la lista y no abre el proyecto", async () => {
    render(<RecentRepositories />);
    await removeWithConfirmation(userEvent.setup(), "uno");

    expect(api.removeRecentRepository).toHaveBeenCalledWith("/home/ana/uno");
    expect(api.openRepository).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("uno")).not.toBeInTheDocument());
    // El otro proyecto sigue ahí.
    expect(screen.getByText("dos")).toBeInTheDocument();
  });

  it("sigue abriendo el proyecto al pulsar su nombre", async () => {
    render(<RecentRepositories />);
    await userEvent.click(await screen.findByRole("button", { name: "uno" }));
    expect(api.openRepository).toHaveBeenCalledWith("/home/ana/uno");
    expect(api.removeRecentRepository).not.toHaveBeenCalled();
  });

  it("se alcanza con Tab y se activa con Enter y con Espacio, y se confirma con teclado", async () => {
    render(<RecentRepositories />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "uno" });

    await user.tab(); // nombre de «uno»
    await user.tab(); // su ×
    expect(screen.getByRole("button", { name: "Quitar uno de recientes" })).toHaveFocus();
    await user.keyboard("{Enter}");
    // Enter solo abre el modal: nada se quita todavía.
    const dialog = await screen.findByRole("dialog", { name: "Quitar de recientes" });
    expect(api.removeRecentRepository).not.toHaveBeenCalled();

    // El foco inicial está en Cancelar; Tab lleva a Quitar y Enter confirma.
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Quitar" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.removeRecentRepository).toHaveBeenCalledWith("/home/ana/uno"));

    // Espacio también abre el modal.
    const remove = await screen.findByRole("button", { name: "Quitar dos de recientes" });
    remove.focus();
    await user.keyboard(" ");
    expect(await screen.findByRole("dialog", { name: "Quitar de recientes" })).toBeInTheDocument();
  });

  it("el botón no se oculta con display ni visibility: sigue siendo enfocable", async () => {
    render(<RecentRepositories />);
    const remove = await screen.findByRole("button", { name: "Quitar uno de recientes" });
    // Oculto solo por opacidad; aparece con ratón (`group-hover`) y con foco (`focus-visible`).
    expect(remove).toHaveClass("opacity-0", "focus-visible:opacity-100", "group-hover:opacity-100");
    expect(remove).not.toHaveClass("hidden", "invisible");
  });

  it("al quitar el último proyecto se muestra el mensaje de lista vacía", async () => {
    stored = [entry("solo")];
    render(<RecentRepositories />);
    await removeWithConfirmation(userEvent.setup(), "solo");
    expect(await screen.findByText("Aún no has abierto repositorios.")).toBeInTheDocument();
  });

  it("quitar el proyecto abierto no lo cierra", async () => {
    useRepositoryStore.setState({ active: { id: "repo-1", path: "/home/ana/uno", name: "uno" } });
    render(<RecentRepositories />);
    await removeWithConfirmation(userEvent.setup(), "uno");
    await waitFor(() => expect(api.removeRecentRepository).toHaveBeenCalled());
    expect(useRepositoryStore.getState().active?.path).toBe("/home/ana/uno");
  });

  it("un fallo al guardar deja la lista como estaba y guarda el error con contexto", async () => {
    vi.mocked(api.removeRecentRepository).mockRejectedValue({
      kind: "io",
      message: "Permission denied",
      detail: "recent.json de solo lectura",
    });
    render(<RecentRepositories />);
    await removeWithConfirmation(userEvent.setup(), "uno");

    await waitFor(() =>
      expect(useRepositoryStore.getState().error?.context).toBe(
        "No se pudo quitar el proyecto de recientes",
      ),
    );
    expect(screen.getByText("uno")).toBeInTheDocument();
  });
});

describe("RecentRepositories: modal de confirmación", () => {
  async function openDialog(name = "uno") {
    const user = userEvent.setup();
    render(<RecentRepositories />);
    await user.click(await screen.findByRole("button", { name: `Quitar ${name} de recientes` }));
    return { user, dialog: await screen.findByRole("dialog", { name: "Quitar de recientes" }) };
  }

  it("la × abre un modal de la app que explica qué se quita y qué no", async () => {
    const { dialog } = await openDialog();
    expect(dialog).toHaveTextContent("¿Quitar «uno» de la lista de recientes?");
    expect(dialog).toHaveTextContent("no se tocan");
    expect(dialog).toHaveTextContent("/home/ana/uno");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Nada se ha quitado todavía.
    expect(api.removeRecentRepository).not.toHaveBeenCalled();
    expect(screen.getByText("uno")).toBeInTheDocument();
  });

  it("el foco inicial está en Cancelar, la opción segura", async () => {
    const { dialog } = await openDialog();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("Cancelar cierra sin quitar nada", async () => {
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.removeRecentRepository).not.toHaveBeenCalled();
    expect(screen.getByText("uno")).toBeInTheDocument();
  });

  it("Esc cierra sin quitar nada", async () => {
    const { user } = await openDialog();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.removeRecentRepository).not.toHaveBeenCalled();
  });

  it("el clic fuera del cuadro cierra sin quitar nada", async () => {
    const { user, dialog } = await openDialog();
    // El fondo oscuro es el padre del diálogo.
    await user.click(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.removeRecentRepository).not.toHaveBeenCalled();
  });

  it("Enter en el foco inicial cancela: no se quita por accidente", async () => {
    const { user } = await openDialog();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.removeRecentRepository).not.toHaveBeenCalled();
  });

  it("Quitar confirma: quita solo ese proyecto y cierra el modal", async () => {
    const { user, dialog } = await openDialog("uno");
    await user.click(within(dialog).getByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(api.removeRecentRepository).toHaveBeenCalledWith("/home/ana/uno"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("uno")).not.toBeInTheDocument();
    expect(screen.getByText("dos")).toBeInTheDocument();
    expect(api.removeRecentRepository).toHaveBeenCalledTimes(1);
  });

  it("el foco queda atrapado en el modal", async () => {
    const { user, dialog } = await openDialog();
    await user.tab();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("no se usa ningún diálogo nativo del navegador", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(api.removeRecentRepository).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    confirm.mockRestore();
    alert.mockRestore();
  });
});
