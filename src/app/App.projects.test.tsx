// Flujo completo de SPEC 11: abrir un proyecto, quitarlo de recientes, cerrarlo y reabrirlo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";
import { DEFAULT_SETTINGS, useSettingsStore } from "@/stores/settings";
import type { RecentRepository } from "@/types/git";

import { App } from "./App";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  const fns = Object.fromEntries(Object.keys(original.api).map((name) => [name, vi.fn()]));
  return { ...original, api: fns };
});

const recent = (name: string): RecentRepository => ({
  path: `/home/ana/${name}`,
  name,
  lastOpenedAt: "2026-10-19T00:00:00Z",
});

let stored: RecentRepository[];

beforeEach(() => {
  stored = [recent("uno"), recent("dos")];
  const mocked = vi.mocked(api);
  mocked.getAppVersion.mockResolvedValue("0.2.0");
  mocked.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
  mocked.updateSettings.mockImplementation(async (s) => s);
  mocked.detectGit.mockResolvedValue({ available: true, version: "2.43.0", message: null });
  mocked.listRecentRepositories.mockImplementation(async () => stored);
  mocked.removeRecentRepository.mockImplementation(async (path) => {
    stored = stored.filter((r) => r.path !== path);
  });
  mocked.openRepository.mockImplementation(async (path) => ({
    id: `id-${path}`,
    path,
    name: path.split("/").pop()!,
  }));
  mocked.getStatus.mockResolvedValue({
    branch: "main",
    detachedHead: false,
    staged: [],
    unstaged: [],
    untracked: [],
  });
  mocked.listCommits.mockResolvedValue({ commits: [], nextCursor: null });
  mocked.listBranches.mockResolvedValue([]);
  mocked.listRemotes.mockResolvedValue([]);
  mocked.listTags.mockResolvedValue([]);

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  useRepositoryStore.setState({
    active: null,
    recents: [],
    opening: false,
    error: null,
    syncRunning: false,
  });
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, git: null, loaded: false });
});

async function openProject(name: string) {
  const recents = await screen.findByRole("navigation", { name: "Repositorios recientes" });
  await userEvent.click(await within(recents).findByRole("button", { name }));
}

/** Confirma en el modal «Quitar de recientes». */
async function confirmRemoval() {
  const dialog = await screen.findByRole("dialog", { name: "Quitar de recientes" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Quitar" }));
}

describe("pie de la ventana", () => {
  it("muestra la versión de la app y ya no el ping", async () => {
    render(<App />);
    expect(await screen.findByText("GitLeviatán v0.2.0")).toBeInTheDocument();
    expect(screen.queryByText(/ping/i)).not.toBeInTheDocument();
  });
});

describe("abrir, quitar y cerrar proyectos", () => {
  it("sin proyecto abierto no hay botón de cerrar", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "uno" });
    expect(screen.queryByRole("button", { name: "Cerrar repositorio" })).not.toBeInTheDocument();
  });

  it("cerrar vuelve a la pantalla inicial y el proyecto se reabre desde Recientes", async () => {
    render(<App />);
    await openProject("uno");
    await screen.findByRole("button", { name: "Cerrar repositorio" });
    expect(screen.queryByText(/Abre un repositorio para ver su historial/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar repositorio" }));
    expect(
      await screen.findByText(/Abre un repositorio para ver su historial/),
    ).toBeInTheDocument();
    expect(screen.getByText("Ningún repositorio abierto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar repositorio" })).not.toBeInTheDocument();
    // La lista de recientes sigue intacta.
    expect(screen.getByRole("button", { name: "uno" })).toBeInTheDocument();

    await openProject("uno");
    expect(await screen.findByRole("button", { name: "Cerrar repositorio" })).toBeInTheDocument();
  });

  it("quitar de recientes el proyecto abierto no lo cierra y reaparece al reabrirlo", async () => {
    render(<App />);
    await openProject("uno");
    await screen.findByRole("button", { name: "Cerrar repositorio" });

    await userEvent.click(screen.getByRole("button", { name: "Quitar uno de recientes" }));
    await confirmRemoval();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "uno" })).not.toBeInTheDocument(),
    );
    // Sigue abierto.
    expect(screen.getByRole("button", { name: "Cerrar repositorio" })).toBeInTheDocument();
    expect(screen.queryByText(/Abre un repositorio para ver su historial/)).not.toBeInTheDocument();

    // Al cerrarlo y volver a abrirlo (con «Abrir repositorio») el backend lo registra otra vez.
    stored = [...stored, recent("uno")];
    await userEvent.click(screen.getByRole("button", { name: "Cerrar repositorio" }));
    await userEvent.click(await screen.findByRole("button", { name: "uno" }));
    expect(api.openRepository).toHaveBeenLastCalledWith("/home/ana/uno");
  });

  it("quitar el último proyecto deja el mensaje de lista vacía", async () => {
    stored = [recent("solo")];
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar solo de recientes" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Quitar de recientes" })).getByRole(
        "button",
        {
          name: "Quitar",
        },
      ),
    );
    expect(await screen.findByText("Aún no has abierto repositorios.")).toBeInTheDocument();
  });

  it("un fallo al quitar se muestra en la cabecera con contexto y detalle técnico", async () => {
    vi.mocked(api.removeRecentRepository).mockRejectedValue({
      kind: "io",
      message: "Permission denied",
      detail: "recent.json es de solo lectura",
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar uno de recientes" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Quitar de recientes" })).getByRole(
        "button",
        {
          name: "Quitar",
        },
      ),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo quitar el proyecto de recientes");
    expect(alert).toHaveTextContent("Permission denied");
    expect(within(alert).getByText("Ver detalle técnico")).toBeInTheDocument();
    // La lista no cambió.
    expect(screen.getByRole("button", { name: "uno" })).toBeInTheDocument();
  });
});
