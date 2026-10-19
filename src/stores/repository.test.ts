import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      openRepository: vi.fn(),
      listRecentRepositories: vi.fn(),
      removeRecentRepository: vi.fn(),
    },
  };
});

const repo = { id: "repo-1", path: "/tmp/a", name: "a" };

beforeEach(() => {
  vi.mocked(api.listRecentRepositories).mockResolvedValue([]);
  vi.mocked(api.removeRecentRepository).mockReset().mockResolvedValue(undefined);
  useRepositoryStore.setState({
    active: null,
    recents: [],
    opening: false,
    error: null,
    syncRunning: false,
  });
});

describe("repository store", () => {
  it("activa el repositorio abierto", async () => {
    vi.mocked(api.openRepository).mockResolvedValue(repo);
    await useRepositoryStore.getState().openRepository("/tmp/a");
    expect(useRepositoryStore.getState().active).toEqual(repo);
  });

  it("un fallo no cambia el repositorio activo y expone el error", async () => {
    useRepositoryStore.setState({ active: repo });
    vi.mocked(api.openRepository).mockImplementation(() =>
      Promise.reject({
        kind: "git",
        message: "La carpeta seleccionada no es un repositorio Git.",
        detail: null,
      }),
    );
    await useRepositoryStore.getState().openRepository("/tmp/x");
    const state = useRepositoryStore.getState();
    expect(state.active).toEqual(repo);
    expect(state.error?.message).toMatch(/no es un repositorio/);
    expect(state.error?.kind).toBe("git");
  });
});

describe("adoptRepository", () => {
  it("activa el repositorio y recarga los recientes", async () => {
    vi.mocked(api.listRecentRepositories).mockResolvedValue([]);
    const repo = { id: "repo-9", path: "/tmp/clon", name: "clon" };
    await useRepositoryStore.getState().adoptRepository(repo);
    expect(useRepositoryStore.getState().active).toEqual(repo);
    expect(api.listRecentRepositories).toHaveBeenCalled();
  });
});

const recent = (name: string) => ({
  path: `/tmp/${name}`,
  name,
  lastOpenedAt: "2026-10-19T00:00:00Z",
});

describe("removeRecent", () => {
  it("quita la entrada en el backend y recarga la lista", async () => {
    vi.mocked(api.listRecentRepositories).mockResolvedValue([recent("b")]);
    useRepositoryStore.setState({ recents: [recent("a"), recent("b")] });

    await useRepositoryStore.getState().removeRecent("/tmp/a");

    expect(api.removeRecentRepository).toHaveBeenCalledWith("/tmp/a");
    expect(useRepositoryStore.getState().recents).toEqual([recent("b")]);
    expect(useRepositoryStore.getState().error).toBeNull();
  });

  it("quitar el proyecto abierto no lo cierra", async () => {
    useRepositoryStore.setState({ active: repo, recents: [recent("a")] });
    vi.mocked(api.listRecentRepositories).mockResolvedValue([]);

    await useRepositoryStore.getState().removeRecent("/tmp/a");

    expect(useRepositoryStore.getState().active).toEqual(repo);
    expect(useRepositoryStore.getState().recents).toEqual([]);
  });

  it("un fallo se expone con contexto y detalle técnico y no recarga la lista", async () => {
    vi.mocked(api.removeRecentRepository).mockRejectedValue({
      kind: "io",
      message: "Permission denied",
      detail: "no se pudo escribir recent.json",
    });
    useRepositoryStore.setState({ recents: [recent("a")] });

    await useRepositoryStore.getState().removeRecent("/tmp/a");

    const { error, recents } = useRepositoryStore.getState();
    expect(error).toMatchObject({
      kind: "io",
      message: "Permission denied",
      detail: "no se pudo escribir recent.json",
      context: "No se pudo quitar el proyecto de recientes",
    });
    expect(recents).toEqual([recent("a")]);
    expect(api.listRecentRepositories).not.toHaveBeenCalled();
  });
});

describe("closeRepository", () => {
  it("vuelve a la pantalla inicial y limpia el error", () => {
    useRepositoryStore.setState({
      active: repo,
      error: { kind: "git", message: "x", detail: null },
    });
    useRepositoryStore.getState().closeRepository();
    expect(useRepositoryStore.getState().active).toBeNull();
    expect(useRepositoryStore.getState().error).toBeNull();
  });

  it("no cierra mientras hay una operación de red en curso", () => {
    useRepositoryStore.setState({ active: repo });
    useRepositoryStore.getState().setSyncRunning(true);
    useRepositoryStore.getState().closeRepository();
    expect(useRepositoryStore.getState().active).toEqual(repo);

    useRepositoryStore.getState().setSyncRunning(false);
    useRepositoryStore.getState().closeRepository();
    expect(useRepositoryStore.getState().active).toBeNull();
  });

  it("el proyecto cerrado se puede reabrir", async () => {
    vi.mocked(api.openRepository).mockResolvedValue(repo);
    useRepositoryStore.setState({ active: repo });
    useRepositoryStore.getState().closeRepository();
    await useRepositoryStore.getState().openRepository("/tmp/a");
    expect(useRepositoryStore.getState().active).toEqual(repo);
  });
});
