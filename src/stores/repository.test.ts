import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: { ...original.api, openRepository: vi.fn(), listRecentRepositories: vi.fn() },
  };
});

const repo = { id: "repo-1", path: "/tmp/a", name: "a" };

beforeEach(() => {
  vi.mocked(api.listRecentRepositories).mockResolvedValue([]);
  useRepositoryStore.setState({ active: null, recents: [], opening: false, error: null });
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
        kind: "notARepository",
        message: "La carpeta seleccionada no es un repositorio Git.",
        detail: null,
      }),
    );
    await useRepositoryStore.getState().openRepository("/tmp/x");
    const state = useRepositoryStore.getState();
    expect(state.active).toEqual(repo);
    expect(state.error).toMatch(/no es un repositorio/);
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
