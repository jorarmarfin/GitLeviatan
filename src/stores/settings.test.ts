import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { LEGACY_THEME_KEY } from "@/lib/theme";
import { DEFAULT_SETTINGS, useSettingsStore } from "@/stores/settings";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      detectGit: vi.fn(),
    },
  };
});

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    settings: DEFAULT_SETTINGS,
    loaded: false,
    git: null,
    loadError: null,
  });
  vi.mocked(api.getSettings).mockReset().mockResolvedValue(DEFAULT_SETTINGS);
  vi.mocked(api.updateSettings)
    .mockReset()
    .mockImplementation(async (settings) => settings);
  vi.mocked(api.detectGit)
    .mockReset()
    .mockResolvedValue({ available: true, version: "2.43.0", message: null });
});

describe("settings store", () => {
  it("carga las preferencias y detecta Git", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, theme: "dark" });
    await useSettingsStore.getState().load();
    const state = useSettingsStore.getState();
    expect(state.settings.theme).toBe("dark");
    expect(state.loaded).toBe(true);
    expect(state.git?.available).toBe(true);
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it("migra el tema de localStorage una sola vez y borra la clave", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "dark");
    await useSettingsStore.getState().load();

    expect(api.updateSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme: "dark" });
    expect(useSettingsStore.getState().settings.theme).toBe("dark");
    expect(localStorage.getItem(LEGACY_THEME_KEY)).toBeNull();

    await useSettingsStore.getState().load();
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
  });

  it("conserva la clave antigua si no se pudo guardar la migración", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "light");
    vi.mocked(api.updateSettings).mockRejectedValue({ kind: "io", message: "disco lleno" });
    await useSettingsStore.getState().load();
    expect(localStorage.getItem(LEGACY_THEME_KEY)).toBe("light");
  });

  it("ignora un valor antiguo inválido", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "neon");
    await useSettingsStore.getState().load();
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it("update devuelve el error y no cambia las preferencias si se rechaza", async () => {
    vi.mocked(api.updateSettings).mockRejectedValue({
      kind: "gitMissing",
      message: "No se encontró el ejecutable de Git.",
      detail: null,
    });
    const result = await useSettingsStore.getState().update({ gitPath: "/falso/git" });
    expect(result.ok).toBe(false);
    expect(useSettingsStore.getState().settings.gitPath).toBeNull();
  });

  it("marca Git como no disponible", async () => {
    vi.mocked(api.detectGit).mockResolvedValue({
      available: false,
      version: null,
      message: "No se encontró el ejecutable de Git.",
    });
    await useSettingsStore.getState().detectGit();
    expect(useSettingsStore.getState().git?.available).toBe(false);
  });
});
