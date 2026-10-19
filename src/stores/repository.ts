import { create } from "zustand";

import { api, toAppError } from "@/lib/api";
import type { AppError, RecentRepository, RepositoryRef } from "@/types/git";

/** Error de una operación del store; `context` dice qué se intentaba. */
export type RepositoryError = AppError & { context?: string };

type RepositoryState = {
  active: RepositoryRef | null;
  recents: RecentRepository[];
  opening: boolean;
  error: RepositoryError | null;
  /** `true` mientras hay un fetch, pull o push en curso (lo informa el panel de sincronización). */
  syncRunning: boolean;
  setSyncRunning: (running: boolean) => void;
  loadRecents: () => Promise<void>;
  openRepository: (path: string) => Promise<void>;
  /** Activa un repositorio ya registrado en el backend (p. ej. recién clonado). */
  adoptRepository: (repository: RepositoryRef) => Promise<void>;
  /** Quita un proyecto de la lista de recientes; no toca el repositorio ni el disco. */
  removeRecent: (path: string) => Promise<void>;
  /** Cierra el repositorio abierto y vuelve a la pantalla inicial. No hace nada si hay una operación de red en curso. */
  closeRepository: () => void;
};

export const useRepositoryStore = create<RepositoryState>((set, get) => ({
  active: null,
  recents: [],
  opening: false,
  error: null,
  syncRunning: false,

  setSyncRunning(running) {
    set({ syncRunning: running });
  },

  async loadRecents() {
    try {
      set({ recents: await api.listRecentRepositories() });
    } catch (error) {
      set({ error: { ...toAppError(error), context: "No se pudo leer la lista de recientes" } });
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
      set({
        opening: false,
        error: { ...toAppError(error), context: "No se pudo abrir el repositorio" },
      });
    }
  },

  async adoptRepository(repository) {
    set({ active: repository, error: null });
    await get().loadRecents();
  },

  async removeRecent(path) {
    set({ error: null });
    try {
      await api.removeRecentRepository(path);
    } catch (error) {
      set({
        error: { ...toAppError(error), context: "No se pudo quitar el proyecto de recientes" },
      });
      return;
    }
    // Quitar el proyecto abierto no lo cierra: solo desaparece de la lista.
    await get().loadRecents();
  },

  closeRepository() {
    if (get().syncRunning) return;
    set({ active: null, error: null });
  },
}));
