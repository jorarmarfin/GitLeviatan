import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { RemoteInfo, RepositoryRef } from "@/types/git";

export type SyncTarget = {
  remotes: RemoteInfo[];
  /** Remoto con el que operar: el del upstream de la rama actual, `origin` o el primero. */
  remote: string | null;
  /** Rama actual (null en detached HEAD). */
  branch: string | null;
  /** Rama remota de la que hacer pull: la del upstream o, si no hay, la actual. */
  pullBranch: string | null;
};

const EMPTY: SyncTarget = { remotes: [], remote: null, branch: null, pullBranch: null };

/** Remotos del repositorio y a qué remoto/rama apuntan fetch, pull y push. */
export function useSyncTarget(repository: RepositoryRef, version: number): SyncTarget {
  const [target, setTarget] = useState<SyncTarget>(EMPTY);

  useEffect(() => {
    let current = true;
    Promise.all([api.listRemotes(repository.id), api.listBranches(repository.id)])
      .then(([remotes, branches]) => {
        if (!current) return;
        const local = branches.find((b) => b.kind === "local" && b.isCurrent) ?? null;
        const upstreamRemote = local?.upstream
          ? remotes.find((r) => local.upstream!.startsWith(`${r.name}/`))
          : undefined;
        const fallback = remotes.find((r) => r.name === "origin") ?? remotes[0];
        const remote = upstreamRemote ?? fallback ?? null;
        setTarget({
          remotes,
          remote: remote?.name ?? null,
          branch: local?.name ?? null,
          pullBranch:
            upstreamRemote && local?.upstream
              ? local.upstream.slice(upstreamRemote.name.length + 1)
              : (local?.name ?? null),
        });
      })
      .catch(() => current && setTarget(EMPTY));
    return () => {
      current = false;
    };
  }, [repository.id, version]);

  return target;
}
