import { useState } from "react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, toAppError } from "@/lib/api";
import type { AppError, RepositoryRef } from "@/types/git";

import {
  HEAD_START,
  resolveStart,
  startIsComplete,
  StartPoint,
  useStartOptions,
  type StartChoice,
} from "./StartPoint";

type Props = {
  repository: RepositoryRef;
  /** Commit seleccionado en el grafo; ofrece «Desde el commit seleccionado». */
  selectedOid: string | null;
  /** Origen con el que se abre el diálogo (p. ej. «Crear rama aquí» preselecciona el commit). */
  initialStart?: StartChoice;
  /** Se llama tras crear la rama (y cambiarse a ella), para refrescar grafo, estado y ramas. */
  onChanged: () => void;
  onClose: () => void;
};

/** Crea una rama desde HEAD, otra rama, un tag, el commit seleccionado o una expresión. */
export function CreateBranchDialog({
  repository,
  selectedOid,
  initialStart = HEAD_START,
  onChanged,
  onClose,
}: Props) {
  const { branches, tags } = useStartOptions(repository.id);
  const [name, setName] = useState("");
  const [start, setStart] = useState<StartChoice>(initialStart);
  const [switchTo, setSwitchTo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const branch = name.trim();
    try {
      const startPoint = await resolveStart(repository.id, start, selectedOid);
      await api.createBranch(repository.id, branch, startPoint);
    } catch (e) {
      setError(toAppError(e));
      setBusy(false);
      return;
    }
    try {
      if (switchTo) await api.checkoutBranch(repository.id, branch);
    } catch (e) {
      // La rama ya existe: se refresca y se explica por qué no se cambió a ella.
      const failure = toAppError(e);
      setError({
        ...failure,
        message: `La rama «${branch}» se creó, pero no se pudo cambiar a ella. ${failure.message}`,
      });
      setBusy(false);
      onChanged();
      return;
    }
    onChanged();
    onClose();
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

        <StartPoint
          name="branch-start"
          legend="Punto de partida"
          choice={start}
          onChange={setStart}
          selectedOid={selectedOid}
          branches={branches}
          tags={tags}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={switchTo}
            onChange={(event) => setSwitchTo(event.target.checked)}
          />
          Cambiar a la nueva rama
        </label>

        {error && <ErrorNotice error={error} title="No se pudo crear la rama" />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={busy || name.trim() === "" || !startIsComplete(start)}
          >
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  );
}
