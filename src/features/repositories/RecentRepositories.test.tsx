import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("RecentRepositories: quitar de recientes", () => {
  it("cada proyecto tiene un botón con su nombre accesible", async () => {
    render(<RecentRepositories />);
    expect(
      await screen.findByRole("button", { name: "Quitar uno de recientes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar dos de recientes" })).toBeInTheDocument();
  });

  it("quitarlo lo elimina de la lista y no abre el proyecto", async () => {
    render(<RecentRepositories />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar uno de recientes" }));

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

  it("se alcanza con Tab y se activa con Enter y con Espacio", async () => {
    render(<RecentRepositories />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "uno" });

    await user.tab(); // nombre de «uno»
    await user.tab(); // su ×
    expect(screen.getByRole("button", { name: "Quitar uno de recientes" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.removeRecentRepository).toHaveBeenCalledWith("/home/ana/uno"));

    const remove = await screen.findByRole("button", { name: "Quitar dos de recientes" });
    remove.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(api.removeRecentRepository).toHaveBeenCalledWith("/home/ana/dos"));
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
    await userEvent.click(await screen.findByRole("button", { name: "Quitar solo de recientes" }));
    expect(await screen.findByText("Aún no has abierto repositorios.")).toBeInTheDocument();
  });

  it("quitar el proyecto abierto no lo cierra", async () => {
    useRepositoryStore.setState({ active: { id: "repo-1", path: "/home/ana/uno", name: "uno" } });
    render(<RecentRepositories />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar uno de recientes" }));
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
    await userEvent.click(await screen.findByRole("button", { name: "Quitar uno de recientes" }));

    await waitFor(() =>
      expect(useRepositoryStore.getState().error?.context).toBe(
        "No se pudo quitar el proyecto de recientes",
      ),
    );
    expect(screen.getByText("uno")).toBeInTheDocument();
  });
});
