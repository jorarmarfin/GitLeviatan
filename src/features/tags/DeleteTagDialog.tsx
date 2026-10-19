import { useState } from "react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { OperationError } from "@/types/git";

type Props = {
  tag: string;
  /** Commit al que apunta el tag. */
  targetOid: string;
  /** Remoto del que se borra; `null` borra el tag local. */
  remote: string | null;
  busy: boolean;
  error: OperationError | null;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Confirma el borrado de un tag. El borrado local pide un clic; el remoto afecta a otras
 * personas y a los pipelines, así que exige escribir el nombre del tag.
 */
export function DeleteTagDialog({
  tag,
  targetOid,
  remote,
  busy,
  error,
  onConfirm,
  onClose,
}: Props) {
  const [typed, setTyped] = useState("");
  const confirmed = remote === null || typed === tag;

  return (
    <Modal
      title={remote ? "Eliminar tag remoto" : "Eliminar tag"}
      onClose={busy ? () => {} : onClose}
    >
      <form
        className="flex flex-col gap-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmed && !busy) onConfirm();
        }}
      >
        {remote ? (
          <>
            <p>
              Vas a eliminar el tag <strong>«{tag}»</strong> (commit{" "}
              <code>{targetOid.slice(0, 7)}</code>) del remoto <strong>«{remote}»</strong>. Quien ya
              lo descargó lo conservará, y los procesos que dependan de él dejarán de verlo. Tu tag
              local no se toca.
            </p>
            <label className="flex flex-col gap-1">
              Escribe <code>{tag}</code> para confirmar
              <input
                autoFocus
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 font-mono"
              />
            </label>
          </>
        ) : (
          <p>
            Vas a eliminar el tag local <strong>«{tag}»</strong> (commit{" "}
            <code>{targetOid.slice(0, 7)}</code>). Los commits no se pierden; si el tag está en el
            remoto, allí se conserva.
          </p>
        )}

        {error && <ErrorNotice error={error} title="No se pudo eliminar el tag" />}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            autoFocus={remote === null}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" size="sm" disabled={!confirmed || busy}>
            {busy ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
