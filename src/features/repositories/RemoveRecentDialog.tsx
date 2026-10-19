import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { RecentRepository } from "@/types/git";

type Props = {
  repository: RecentRepository;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Confirmación al quitar un proyecto de Recientes. Es un modal de la app, no un `confirm()`
 * nativo. El foco inicial va a **Cancelar**, la opción segura.
 */
export function RemoveRecentDialog({ repository, busy, onConfirm, onClose }: Props) {
  return (
    <Modal title="Quitar de recientes" onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <p>
          ¿Quitar <strong>«{repository.name}»</strong> de la lista de recientes?
        </p>
        <p className="text-muted-foreground">
          Solo se quita de la lista. El repositorio y tus archivos no se tocan, y podrás volver a
          abrirlo con <em>Abrir repositorio</em>.
        </p>
        <p className="break-all text-xs text-muted-foreground">
          <code>{repository.path}</code>
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" autoFocus disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={busy} onClick={onConfirm}>
            Quitar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
