import { useEffect, useState } from "react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { api, toAppError } from "@/lib/api";
import type { AppError, RemoteInfo, RepositoryRef } from "@/types/git";

type Props = { repository: RepositoryRef; externalVersion: number };

/** Remotos del repositorio con su URL (sin credenciales). */
export function RemotesPanel({ repository, externalVersion }: Props) {
  const [remotes, setRemotes] = useState<RemoteInfo[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let current = true;
    api
      .listRemotes(repository.id)
      .then((next) => {
        if (!current) return;
        setRemotes(next);
        setError(null);
      })
      .catch((e: unknown) => current && setError(toAppError(e)));
    return () => {
      current = false;
    };
  }, [repository.id, externalVersion]);

  if (error) {
    return (
      <div className="px-2">
        <ErrorNotice error={error} title="No se pudieron cargar los remotos" />
      </div>
    );
  }
  if (!remotes) return null;

  return (
    <section aria-label="Remotos" className="flex flex-col gap-1">
      <h2 className="px-2 text-xs font-semibold uppercase text-muted-foreground">Remotos</h2>
      {remotes.length === 0 && (
        <p className="px-2 text-sm text-muted-foreground">Sin remotos configurados.</p>
      )}
      <ul>
        {remotes.map((remote) => (
          <li key={remote.name} className="px-2 py-1 text-sm">
            <span className="font-medium">{remote.name}</span>
            <span
              className="block truncate text-xs text-muted-foreground"
              title={
                remote.fetchUrl === remote.pushUrl
                  ? remote.fetchUrl
                  : `fetch: ${remote.fetchUrl}\npush: ${remote.pushUrl}`
              }
            >
              {remote.fetchUrl}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
