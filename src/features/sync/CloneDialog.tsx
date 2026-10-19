import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { useRepositoryStore } from "@/stores/repository";
import type { SyncFailure } from "@/types/git";

import { cloneDestination } from "./cloneDestination";
import { SyncProgressBar } from "./SyncProgressBar";
import { useSyncOperation } from "./useSyncOperation";

export function CloneDialog({ onClose }: { onClose: () => void }) {
  const adoptRepository = useRepositoryStore((s) => s.adoptRepository);
  const { running, progress, canCancel, execute, cancel } = useSyncOperation();
  const [url, setUrl] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [failure, setFailure] = useState<SyncFailure | null>(null);

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setParent(selected);
  }

  async function submit() {
    if (!parent) return;
    setFailure(null);
    const result = await execute(() =>
      api.cloneRepository(url.trim(), cloneDestination(parent, url)),
    );
    if (result.ok) {
      await adoptRepository(result.value);
      onClose();
    } else if (result.failure.kind !== "cancelled") {
      setFailure(result.failure);
    }
  }

  return (
    <Modal title="Clonar repositorio" onClose={running ? () => undefined : onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          URL del repositorio
          <input
            autoFocus
            value={url}
            disabled={running}
            placeholder="git@github.com:usuario/proyecto.git"
            onChange={(event) => setUrl(event.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5"
          />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span>Carpeta destino</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={running}
              onClick={pickFolder}
            >
              <FolderOpen aria-hidden="true" />
              Elegir carpeta…
            </Button>
            <span className="truncate text-xs text-muted-foreground" title={parent ?? undefined}>
              {parent && url.trim() !== ""
                ? cloneDestination(parent, url)
                : (parent ?? "Sin elegir")}
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          La autenticación usa tu ssh-agent o el credential helper de Git; la app no guarda
          credenciales.
        </p>

        {running && <SyncProgressBar progress={progress} />}
        {failure && <ErrorNotice error={failure} />}

        <div className="flex justify-end gap-2">
          {running ? (
            <Button type="button" variant="outline" disabled={!canCancel} onClick={cancel}>
              Cancelar clonado
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button type="submit" disabled={url.trim() === "" || parent === null}>
                Clonar
              </Button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
