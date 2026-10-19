import { useCallback, useEffect, useState } from "react";

import { api, errorDetail, errorMessage } from "@/lib/api";
import type { OperationError, RepositoryRef } from "@/types/git";

import type { BranchInfo, DeleteBranchOutcome } from "./types";

/** Lista de ramas y las operaciones que la modifican. */
export function useBranches(
  repository: RepositoryRef,
  externalVersion: number,
  onChanged: () => void,
) {
  const [branches, setBranches] = useState<BranchInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OperationError | null>(null);

  useEffect(() => {
    let current = true;
    api
      .listBranches(repository.id)
      .then((next) => {
        if (!current) return;
        setBranches(next);
        setLoadError(null);
      })
      .catch((e: unknown) => current && setLoadError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [repository.id, externalVersion]);

  // Tras una operación con éxito se avisa a quien orquesta para refrescar todo
  // (ramas, estado e historial).
  const run = useCallback(
    async (operation: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await operation();
        onChanged();
        return true;
      } catch (e) {
        setError({ message: errorMessage(e), detail: errorDetail(e) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const checkout = useCallback(
    (branch: string) => run(() => api.checkoutBranch(repository.id, branch)),
    [repository.id, run],
  );
  const create = useCallback(
    (name: string, startPoint: string | null) =>
      run(() => api.createBranch(repository.id, name, startPoint)),
    [repository.id, run],
  );

  /** Devuelve el resultado, o `null` si falló (el error queda en `error`). */
  const remove = useCallback(
    async (branch: string, force: boolean): Promise<DeleteBranchOutcome | null> => {
      setBusy(true);
      setError(null);
      try {
        const outcome = await api.deleteBranch(repository.id, branch, force);
        // `needsForce` no cambió nada: no hace falta refrescar.
        if (outcome.status === "deleted") onChanged();
        return outcome;
      } catch (e) {
        setError({ message: errorMessage(e), detail: errorDetail(e) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [repository.id, onChanged],
  );

  const clearError = useCallback(() => setError(null), []);

  return { branches, loadError, busy, error, clearError, checkout, create, remove };
}
