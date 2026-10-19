import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import type { ChangedFile, RepositoryRef, RepositoryStatus } from "@/types/git";

type Props = { repository: RepositoryRef };

type Load =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; status: RepositoryStatus };

function FileList({ title, files }: { title: string; files: (ChangedFile | string)[] }) {
  if (files.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
        {title} ({files.length})
      </h3>
      <ul className="space-y-0.5 text-sm">
        {files.map((file) => {
          const path = typeof file === "string" ? file : file.path;
          const kind = typeof file === "string" ? "nuevo" : file.kind;
          const orig = typeof file === "string" ? null : file.origPath;
          return (
            <li key={`${kind}:${path}`} className="flex gap-2">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{kind}</span>
              <span className="whitespace-pre-wrap break-all">
                {orig ? `${orig} → ${path}` : path}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Se remonta (prop `key`) al cambiar de repositorio: el estado inicial ya es "loading".
export function StatusPanel({ repository }: Props) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .getStatus(repository.id)
      .then((status) => !cancelled && setLoad({ phase: "ready", status }))
      .catch(
        (error: unknown) => !cancelled && setLoad({ phase: "error", message: errorMessage(error) }),
      );
    return () => {
      cancelled = true;
    };
  }, [repository.id]);

  if (load.phase === "loading") return <p className="p-3 text-sm">Cargando cambios…</p>;
  if (load.phase === "error") {
    return (
      <p role="alert" className="p-3 text-sm text-destructive">
        {load.message}
      </p>
    );
  }

  const { status } = load;
  const clean = status.staged.length + status.unstaged.length + status.untracked.length === 0;

  return (
    <div className="flex flex-col gap-4 p-3">
      <p className="text-sm">
        {status.detachedHead ? "HEAD desacoplado" : `Rama: ${status.branch ?? "—"}`}
      </p>
      {clean && <p className="text-sm text-muted-foreground">Sin cambios.</p>}
      <FileList title="Staged" files={status.staged} />
      <FileList title="Unstaged" files={status.unstaged} />
      <FileList title="Sin seguimiento" files={status.untracked} />
    </div>
  );
}
