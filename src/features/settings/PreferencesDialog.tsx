import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { ErrorNotice } from "@/components/ErrorNotice";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, toAppError } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";
import { useSettingsStore } from "@/stores/settings";
import type { AppError } from "@/types/git";

export const MIN_RECENT = 5;
export const MAX_RECENT = 50;

export function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore((s) => s.settings);
  const git = useSettingsStore((s) => s.git);
  const update = useSettingsStore((s) => s.update);
  const detectGit = useSettingsStore((s) => s.detectGit);
  const recents = useRepositoryStore((s) => s.recents);
  const loadRecents = useRepositoryStore((s) => s.loadRecents);

  const [gitPath, setGitPath] = useState(settings.gitPath ?? "");
  const [maxRecent, setMaxRecent] = useState(String(settings.maxRecentRepositories));
  const [reopenLast, setReopenLast] = useState(settings.reopenLastRepository);
  const [error, setError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const parsedMax = Number(maxRecent);
  const maxValid =
    Number.isInteger(parsedMax) && parsedMax >= MIN_RECENT && parsedMax <= MAX_RECENT;

  async function pickGit() {
    const selected = await open({ directory: false, multiple: false });
    if (typeof selected === "string") setGitPath(selected);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const result = await update({
      gitPath: gitPath.trim() === "" ? null : gitPath.trim(),
      maxRecentRepositories: parsedMax,
      reopenLastRepository: reopenLast,
    });
    if (result.ok) {
      setSaved(true);
      await Promise.all([detectGit(), loadRecents()]);
    } else {
      // Una ruta inválida no se guarda: se muestra el motivo y el formulario sigue abierto.
      setError(result.error);
    }
    setSaving(false);
  }

  async function clearRecents() {
    setError(null);
    try {
      await api.clearRecentRepositories();
      await loadRecents();
    } catch (e) {
      setError(toAppError(e));
    }
  }

  return (
    <Modal title="Preferencias" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-1 text-sm">
          <span>Tema</span>
          <ThemeToggle />
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="git-path">Ejecutable de Git</label>
          <div className="flex items-center gap-2">
            <input
              id="git-path"
              value={gitPath}
              placeholder="Vacío = buscar en el PATH"
              onChange={(event) => setGitPath(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5"
            />
            <Button type="button" size="sm" variant="outline" onClick={pickGit}>
              Elegir…
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {git?.available
              ? `Git ${git.version} detectado.`
              : "No se detecta Git con la configuración actual."}{" "}
            Se ejecutará el archivo que indiques: elige solo binarios de confianza.
          </p>
        </div>

        <div className="flex items-start gap-2 text-sm">
          <input
            id="reopen-last"
            type="checkbox"
            checked={reopenLast}
            onChange={(event) => setReopenLast(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <label htmlFor="reopen-last" className="flex flex-col">
            Abrir el último proyecto al iniciar
            <span className="text-xs text-muted-foreground">
              «Cerrar repositorio» lo olvida: no se vuelve a abrir en el siguiente inicio.
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="max-recent">Repositorios recientes a conservar</label>
          <div className="flex items-center gap-2">
            <input
              id="max-recent"
              type="number"
              min={MIN_RECENT}
              max={MAX_RECENT}
              value={maxRecent}
              onChange={(event) => setMaxRecent(event.target.value)}
              className="w-24 rounded-md border border-input bg-background px-2 py-1.5"
            />
            <span className="text-xs text-muted-foreground">
              Entre {MIN_RECENT} y {MAX_RECENT}
            </span>
          </div>
          {!maxValid && (
            <p role="alert" className="text-xs text-destructive">
              Introduce un número entero entre {MIN_RECENT} y {MAX_RECENT}.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={recents.length === 0}
              onClick={() => void clearRecents()}
            >
              Limpiar recientes
            </Button>
            <span className="text-xs text-muted-foreground">
              {recents.length === 0 ? "La lista está vacía." : `${recents.length} en la lista.`}
            </span>
          </div>
        </div>

        {error && <ErrorNotice error={error} title="No se pudo completar la operación" />}
        {saved && !error && (
          <p role="status" className="text-sm text-muted-foreground">
            Preferencias guardadas.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button type="submit" disabled={saving || !maxValid}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
