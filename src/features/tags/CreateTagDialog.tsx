import { useState } from "react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  HEAD_START,
  resolveStart,
  startIsComplete,
  StartPoint,
  useStartOptions,
  type StartChoice,
} from "@/features/branches/StartPoint";
import { api, toAppError } from "@/lib/api";
import type { AppError, RepositoryRef } from "@/types/git";

type Props = {
  repository: RepositoryRef;
  /** Commit seleccionado en el grafo; ofrece «Desde el commit seleccionado». */
  selectedOid: string | null;
  /** Origen con el que se abre el diálogo («Crear tag aquí» preselecciona el commit). */
  initialStart?: StartChoice;
  /** Se llama tras crear el tag, para refrescar la lista y el grafo. */
  onChanged: () => void;
  onClose: () => void;
};

/** Crea un tag local: anotado si lleva mensaje, ligero si no. */
export function CreateTagDialog({
  repository,
  selectedOid,
  initialStart = HEAD_START,
  onChanged,
  onClose,
}: Props) {
  const { branches, tags } = useStartOptions(repository.id);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [start, setStart] = useState<StartChoice>(initialStart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const target = await resolveStart(repository.id, start, selectedOid);
      await api.createTag(repository.id, name.trim(), target, message.trim() || null);
    } catch (e) {
      setError(toAppError(e));
      setBusy(false);
      return;
    }
    onChanged();
    onClose();
  }

  return (
    <Modal title="Crear tag" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Nombre del tag
          <input
            autoFocus
            value={name}
            placeholder="v1.0.0"
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Mensaje (opcional)
          <textarea
            value={message}
            rows={3}
            onChange={(event) => setMessage(event.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5"
          />
          <span className="text-xs text-muted-foreground">
            {message.trim() === ""
              ? "Sin mensaje, el tag es ligero."
              : "Con mensaje, el tag es anotado (guarda autor, fecha y mensaje)."}
          </span>
        </label>

        <StartPoint
          name="tag-start"
          legend="Crear el tag en"
          choice={start}
          onChange={setStart}
          selectedOid={selectedOid}
          branches={branches}
          tags={tags}
        />

        {error && <ErrorNotice error={error} title="No se pudo crear el tag" />}

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
