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
  /**
   * Reabre al iniciar el último proyecto. Si ya no existe o no se puede abrir no muestra ningún
   * error: se olvida la ruta guardada y la app arranca en la pantalla inicial.
   */
  reopenLast: (path: string) => Promise<void>;
};

/** Olvida el último proyecto en el backend; nunca lanza (es una comodidad, no una operación). */
async function forgetLast(): Promise<void> {
  try {
    await api.forgetLastRepository();
  } catch {
    // Sin persistencia el único efecto es que se reabra el proyecto en el próximo inicio.
  }
}

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
    // Cerrar explícitamente significa «no lo reabras al iniciar». Un fallo al guardarlo no
    // impide cerrar.
    void forgetLast();
  },

  async reopenLast(path) {
    try {
      const repository = await api.openRepository(path);
      // Si el usuario abrió otro proyecto mientras tanto, no se pisa su elección.
      if (get().active === null) set({ active: repository });
      await get().loadRecents();
    } catch {
      await forgetLast();
    }
  },
}));
