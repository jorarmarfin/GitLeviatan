import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { OperationError } from "@/types/git";

import type { BranchInfo } from "./types";

export type DeleteStage = "confirm" | "force";

type Props = {
  branch: BranchInfo;
  stage: DeleteStage;
  busy: boolean;
  error: OperationError | null;
  onConfirm: () => void;
  onClose: () => void;
};

export function DeleteBranchDialog({ branch, stage, busy, error, onConfirm, onClose }: Props) {
  const force = stage === "force";
  return (
    <Modal title={force ? "Rama sin fusionar" : "Eliminar rama"} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        {force ? (
          <>
            <p>
              La rama <strong>«{branch.name}»</strong> tiene commits que no están fusionados. Si la
              eliminas, esos commits dejarán de ser alcanzables desde cualquier rama.
            </p>
            <p className="text-muted-foreground">
              Punta actual: <code>{branch.tipOid.slice(0, 7)}</code>. Mientras Git no limpie el
              reflog, podrás recuperarla con <code>git reflog</code>.
            </p>
          </>
        ) : (
          <p>
            Se eliminará la rama local <strong>«{branch.name}»</strong>. Git comprobará antes que
            sus commits ya estén fusionados.
          </p>
        )}

        {error && <ErrorNotice error={error} title="No se pudo eliminar la rama" />}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" autoFocus disabled={busy} onClick={onConfirm}>
            {force ? "Eliminar de todos modos" : "Eliminar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
