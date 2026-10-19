import { create } from "zustand";

import { api, errorMessage } from "@/lib/api";
import type { RecentRepository, RepositoryRef } from "@/types/git";

type RepositoryState = {
  active: RepositoryRef | null;
  recents: RecentRepository[];
  opening: boolean;
  error: string | null;
  loadRecents: () => Promise<void>;
  openRepository: (path: string) => Promise<void>;
};

export const useRepositoryStore = create<RepositoryState>((set, get) => ({
  active: null,
  recents: [],
  opening: false,
  error: null,

  async loadRecents() {
    try {
      set({ recents: await api.listRecentRepositories() });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async openRepository(path) {
    set({ opening: true, error: null });
    try {
      const repository = await api.openRepository(path);
      set({ active: repository, opening: false });
      await get().loadRecents();
    } catch (error) {
      // Un fallo no cambia el repositorio activo.
      set({ opening: false, error: errorMessage(error) });
    }
  },
}));
