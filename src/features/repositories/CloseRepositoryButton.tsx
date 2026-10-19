import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRepositoryStore } from "@/stores/repository";

/** Cierra el repositorio abierto y vuelve a la pantalla inicial. Solo aparece con uno abierto. */
export function CloseRepositoryButton() {
  const active = useRepositoryStore((s) => s.active);
  const syncRunning = useRepositoryStore((s) => s.syncRunning);
  const closeRepository = useRepositoryStore((s) => s.closeRepository);

  if (!active) return null;

  const blockedReason =
    "Hay un fetch, pull o push en curso. Espera a que termine o cancélalo para cerrar el repositorio.";
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={syncRunning}
        title={syncRunning ? blockedReason : "Cerrar el repositorio y volver al inicio"}
        aria-describedby={syncRunning ? "close-blocked" : undefined}
        onClick={closeRepository}
      >
        <X aria-hidden="true" />
        Cerrar repositorio
      </Button>
      {/* El motivo también es visible: un botón deshabilitado no siempre muestra su título. */}
      {syncRunning && (
        <span id="close-blocked" className="text-xs text-muted-foreground">
          Operación de red en curso
        </span>
      )}
    </>
  );
}
