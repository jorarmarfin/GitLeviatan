import { useState } from "react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { OperationError } from "@/types/git";

type Props = {
  selectedOid: string | null;
  busy: boolean;
  error: OperationError | null;
  onCreate: (name: string, startPoint: string | null) => Promise<boolean>;
  onClose: () => void;
};

export function CreateBranchDialog({ selectedOid, busy, error, onCreate, onClose }: Props) {
  const [name, setName] = useState("");
  const [fromSelected, setFromSelected] = useState(false);

  async function submit() {
    const created = await onCreate(name.trim(), fromSelected && selectedOid ? selectedOid : null);
    if (created) onClose();
  }

  return (
    <Modal title="Crear rama" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Nombre de la rama
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5"
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">Punto de partida</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="start"
              checked={!fromSelected}
              onChange={() => setFromSelected(false)}
            />
            Desde HEAD
          </label>
          {selectedOid && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="start"
                checked={fromSelected}
                onChange={() => setFromSelected(true)}
              />
              Desde el commit seleccionado ({selectedOid.slice(0, 7)})
            </label>
          )}
        </fieldset>

        {error && <ErrorNotice error={error} title="No se pudo crear la rama" />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={busy || name.trim() === ""}>
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  );
}
