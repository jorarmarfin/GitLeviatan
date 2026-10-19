import { create } from "zustand";

import { api, errorDetail, errorMessage } from "@/lib/api";
import { clearLegacyTheme, readLegacyTheme } from "@/lib/theme";
import type { GitInfo, OperationError, Settings } from "@/types/git";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: "system",
  gitPath: null,
  maxRecentRepositories: 20,
};

type UpdateResult = { ok: true } | { ok: false; error: OperationError };

type SettingsState = {
  settings: Settings;
  /** `true` cuando ya se leyeron del backend. */
  loaded: boolean;
  /** `null` hasta saber si Git está disponible. */
  git: GitInfo | null;
  loadError: string | null;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<UpdateResult>;
  detectGit: () => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  git: null,
  loadError: null,

  async load() {
    try {
      set({ settings: await api.getSettings(), loaded: true, loadError: null });
    } catch (error) {
      set({ loaded: true, loadError: errorMessage(error) });
    }

    // Migración única del tema desde localStorage: se borra la clave solo si se guardó.
    const legacy = readLegacyTheme();
    if (legacy) {
      const result = await get().update({ theme: legacy });
      if (result.ok) clearLegacyTheme();
    }
    await get().detectGit();
  },

  async update(patch) {
    try {
      const saved = await api.updateSettings({ ...get().settings, ...patch });
      set({ settings: saved });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: { message: errorMessage(error), detail: errorDetail(error) } };
    }
  },

  async detectGit() {
    try {
      set({ git: await api.detectGit() });
    } catch (error) {
      set({ git: { available: false, version: null, message: errorMessage(error) } });
    }
  },
}));
