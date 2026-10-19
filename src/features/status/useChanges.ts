import { useCallback, useEffect, useState } from "react";

import { api, errorDetail, errorMessage } from "@/lib/api";
import type { RepositoryRef, RepositoryStatus } from "@/types/git";

export type OperationError = { message: string; detail: string | null };

/** Estado de cambios del repositorio y las operaciones que lo modifican. */
export function useChanges(repository: RepositoryRef, onCommitted: () => void) {
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<RepositoryStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<OperationError | null>(null);

  useEffect(() => {
    let current = true;
    api
      .getStatus(repository.id)
      .then((next) => {
        if (!current) return;
        setStatus(next);
        setLoadError(null);
      })
      .catch((e: unknown) => current && setLoadError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [repository.id, version]);

  // Tras cada operación (con éxito o sin él) se vuelve a leer el estado real.
  const run = useCallback(async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setOperationError(null);
    try {
      await operation();
      return true;
    } catch (e) {
      setOperationError({ message: errorMessage(e), detail: errorDetail(e) });
      return false;
    } finally {
      setBusy(false);
      setVersion((v) => v + 1);
    }
  }, []);

  const stage = useCallback(
    (paths: string[]) => run(() => api.stageFiles(repository.id, paths)),
    [repository.id, run],
  );
  const unstage = useCallback(
    (paths: string[]) => run(() => api.unstageFiles(repository.id, paths)),
    [repository.id, run],
  );
  const commit = useCallback(
    async (message: string) => {
      const ok = await run(() => api.createCommit(repository.id, message));
      if (ok) onCommitted();
      return ok;
    },
    [repository.id, run, onCommitted],
  );

  return { status, loadError, busy, operationError, version, stage, unstage, commit };
}
