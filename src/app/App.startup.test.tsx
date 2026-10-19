// SPEC 12: al iniciar se reabre el último proyecto; cerrarlo lo olvida; los fallos no molestan.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";
import { DEFAULT_SETTINGS, useSettingsStore } from "@/stores/settings";
import type { Settings } from "@/types/git";

import { App } from "./App";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  const fns = Object.fromEntries(Object.keys(original.api).map((name) => [name, vi.fn()]));
  return { ...original, api: fns };
});

const LAST = "/home/ana/proyecto";

function setup(settings: Partial<Settings> = {}, git = { available: true, version: "2.43.0" }) {
  const mocked = vi.mocked(api);
  mocked.getAppVersion.mockResolvedValue("0.2.0");
  mocked.getSettings.mockResolvedValue({
    ...DEFAULT_SETTINGS,
    lastRepositoryPath: LAST,
    ...settings,
  });
  mocked.updateSettings.mockImplementation(async (s) => s);
  mocked.detectGit.mockResolvedValue({ ...git, message: null });
  mocked.listRecentRepositories.mockResolvedValue([]);
  mocked.forgetLastRepository.mockResolvedValue(undefined);
  mocked.openRepository.mockImplementation(async (path) => ({
    id: "repo-1",
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
}

beforeEach(() => {
  for (const fn of Object.values(vi.mocked(api))) (fn as ReturnType<typeof vi.fn>).mockReset();
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

describe("abrir el último proyecto al iniciar", () => {
  it("lo reabre automáticamente", async () => {
    setup();
    render(<App />);
    expect(await screen.findByRole("button", { name: "Cerrar repositorio" })).toBeInTheDocument();
    expect(api.openRepository).toHaveBeenCalledTimes(1);
    expect(api.openRepository).toHaveBeenCalledWith(LAST);
    expect(screen.getByText("proyecto")).toBeInTheDocument();
  });

  it("con la preferencia desactivada no lo abre", async () => {
    setup({ reopenLastRepository: false });
    render(<App />);
    await waitFor(() => expect(api.detectGit).toHaveBeenCalled());
    await screen.findByText(/Abre un repositorio para ver su historial/);
    expect(api.openRepository).not.toHaveBeenCalled();
  });

  it("sin último proyecto arranca en la pantalla inicial", async () => {
    setup({ lastRepositoryPath: null });
    render(<App />);
    await screen.findByText(/Abre un repositorio para ver su historial/);
    expect(api.openRepository).not.toHaveBeenCalled();
  });

  it("si ya no existe, arranca sin error y olvida la ruta", async () => {
    setup();
    vi.mocked(api.openRepository).mockRejectedValue({
      kind: "notFound",
      message: "La carpeta no existe: /home/ana/proyecto",
      detail: null,
    });
    render(<App />);

    await screen.findByText(/Abre un repositorio para ver su historial/);
    await waitFor(() => expect(api.forgetLastRepository).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(useRepositoryStore.getState().error).toBeNull();
    expect(useRepositoryStore.getState().active).toBeNull();
  });

  it("sin Git no intenta abrirlo ni olvida el proyecto", async () => {
    setup({}, { available: false, version: null as unknown as string });
    render(<App />);
    await screen.findByText("No se encontró Git");
    expect(api.openRepository).not.toHaveBeenCalled();
    expect(api.forgetLastRepository).not.toHaveBeenCalled();
  });

  it("cerrar el repositorio lo olvida y no se reabre solo", async () => {
    setup();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Cerrar repositorio" }));

    expect(
      await screen.findByText(/Abre un repositorio para ver su historial/),
    ).toBeInTheDocument();
    expect(api.forgetLastRepository).toHaveBeenCalledTimes(1);
    // El efecto de inicio solo corre una vez: no vuelve a abrirlo.
    expect(api.openRepository).toHaveBeenCalledTimes(1);
  });

  it("un fallo al olvidarlo no impide cerrar el repositorio", async () => {
    setup();
    vi.mocked(api.forgetLastRepository).mockRejectedValue({
      kind: "io",
      message: "disco lleno",
      detail: null,
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Cerrar repositorio" }));
    expect(
      await screen.findByText(/Abre un repositorio para ver su historial/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("reopenLast (store)", () => {
  it("no pisa un proyecto que el usuario abrió mientras tanto", async () => {
    const other = { id: "repo-2", path: "/otro", name: "otro" };
    vi.mocked(api.openRepository).mockResolvedValue({ id: "repo-1", path: LAST, name: "proyecto" });
    vi.mocked(api.listRecentRepositories).mockResolvedValue([]);
    useRepositoryStore.setState({ active: other });

    await useRepositoryStore.getState().reopenLast(LAST);
    expect(useRepositoryStore.getState().active).toEqual(other);
  });
});
