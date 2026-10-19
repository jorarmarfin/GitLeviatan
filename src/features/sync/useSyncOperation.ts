import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { api, syncFailure } from "@/lib/api";
import type { SyncFailure, SyncProgress } from "@/types/git";

export type SyncResult<T> = { ok: true; value: T } | { ok: false; failure: SyncFailure };

/**
 * Ejecuta una operación de red del backend y sigue su progreso (`sync-progress`).
 * Solo admite una operación a la vez; el `operationId` se aprende del primer evento,
 * que el backend emite nada más arrancar.
 */
export function useSyncOperation() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<SyncProgress>("sync-progress", (event) => {
      if (activeRef.current) setProgress(event.payload);
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // Sin canal de eventos (p. ej. fuera de Tauri) la operación sigue, sin progreso.
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const execute = useCallback(async <T>(operation: () => Promise<T>): Promise<SyncResult<T>> => {
    activeRef.current = true;
    setRunning(true);
    setProgress(null);
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      return { ok: false, failure: syncFailure(error) };
    } finally {
      activeRef.current = false;
      setRunning(false);
      setProgress(null);
    }
  }, []);

  const operationId = progress?.operationId ?? null;
  const cancel = useCallback(() => {
    if (operationId) void api.cancelOperation(operationId).catch(() => undefined);
  }, [operationId]);

  return { running, progress, canCancel: running && operationId !== null, execute, cancel };
}
