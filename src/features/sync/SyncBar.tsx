import { useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, WifiOff, X } from "lucide-react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { AppError, RepositoryRef } from "@/types/git";

import { SyncProgressBar } from "./SyncProgressBar";
import { useSyncOperation } from "./useSyncOperation";
import { useSyncTarget } from "./useSyncTarget";

type Props = {
  repository: RepositoryRef;
  /** Sube cuando otra parte de la app cambió el repositorio. */
  externalVersion: number;
  /** Se llama tras una operación con éxito para refrescar ramas, estado e historial. */
  onChanged: () => void;
};

type Kind = "fetch" | "pull" | "push";

const FAILED: Record<Kind, string> = {
  fetch: "No se pudo hacer fetch",
  pull: "No se pudo hacer pull",
  push: "No se pudo hacer push",
};

export function SyncBar({ repository, externalVersion, onChanged }: Props) {
  const target = useSyncTarget(repository, externalVersion);
  const { running, progress, canCancel, execute, cancel } = useSyncOperation();
  const [failure, setFailure] = useState<{ error: AppError; title: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(kind: Kind) {
    const { remote, branch, pullBranch } = target;
    if (!remote) return;
    setFailure(null);
    setNotice(null);
    const result = await execute(() => {
      if (kind === "fetch") return api.fetch(repository.id, remote);
      if (kind === "pull") return api.pull(repository.id, remote, pullBranch!);
      return api.push(repository.id, remote, branch!);
    });
    if (result.ok) {
      setOffline(false);
      onChanged();
      return;
    }
    // Un fallo a medias puede haber traído objetos: se refresca igualmente.
    onChanged();
    if (result.failure.kind === "cancelled") setNotice("Operación cancelada.");
    else {
      setOffline(result.failure.kind === "network");
      setFailure({ error: result.failure, title: FAILED[kind] });
    }
  }

  const noRemote = target.remote === null;
  const disabled = running || noRemote;
  const noBranch = target.branch === null;

  return (
    <div
      aria-label="Sincronización"
      className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2"
    >
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        title={noRemote ? "Este repositorio no tiene remotos" : `Fetch de ${target.remote}`}
        onClick={() => void run("fetch")}
      >
        <RefreshCw aria-hidden="true" />
        Fetch
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || noBranch}
        title="Pull (solo fast-forward)"
        onClick={() => void run("pull")}
      >
        <ArrowDown aria-hidden="true" />
        Pull
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || noBranch}
        title={noBranch ? "No hay rama actual" : `Push de ${target.branch}`}
        onClick={() => void run("push")}
      >
        <ArrowUp aria-hidden="true" />
        Push
      </Button>

      {running && (
        <>
          <SyncProgressBar progress={progress} />
          <Button size="sm" variant="ghost" disabled={!canCancel} onClick={cancel}>
            <X aria-hidden="true" />
            Cancelar
          </Button>
        </>
      )}

      {offline && !running && (
        <span
          role="status"
          className="flex items-center gap-1 text-xs text-muted-foreground"
          title="La última operación no pudo conectar con el remoto"
        >
          <WifiOff className="size-3.5" aria-hidden="true" />
          Sin conexión al remoto
        </span>
      )}
      {notice && !running && (
        <span role="status" className="text-xs text-muted-foreground">
          {notice}
        </span>
      )}
      {failure && !running && (
        <div className="basis-full">
          <ErrorNotice error={failure.error} title={failure.title} />
        </div>
      )}
    </div>
  );
}
