import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import type { RepositoryRef } from "@/types/git";

import { CreateBranchDialog } from "./CreateBranchDialog";
import { DeleteBranchDialog, type DeleteStage } from "./DeleteBranchDialog";
import type { BranchInfo } from "./types";
import { useBranches } from "./useBranches";

type Props = {
  repository: RepositoryRef;
  selectedOid: string | null;
  /** Sube cuando otra parte de la app cambió el repositorio. */
  externalVersion: number;
  /** Se llama tras una operación con éxito para refrescar estado e historial. */
  onChanged: () => void;
};

type Dialog = { type: "create" } | { type: "delete"; branch: BranchInfo; stage: DeleteStage };

function Sync({ branch }: { branch: BranchInfo }) {
  if (branch.ahead === 0 && branch.behind === 0) return null;
  return (
    <span
      className="shrink-0 text-xs text-muted-foreground"
      title={`Respecto a ${branch.upstream}. Depende del último fetch.`}
    >
      {branch.ahead > 0 && `↑${branch.ahead}`}
      {branch.ahead > 0 && branch.behind > 0 && " "}
      {branch.behind > 0 && `↓${branch.behind}`}
    </span>
  );
}

export function BranchesPanel({ repository, selectedOid, externalVersion, onChanged }: Props) {
  const { branches, loadError, busy, error, clearError, checkout, create, remove } = useBranches(
    repository,
    externalVersion,
    onChanged,
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);

  function openDialog(next: Dialog) {
    clearError();
    setDialog(next);
  }
  function closeDialog() {
    clearError();
    setDialog(null);
  }

  async function confirmDelete(branch: BranchInfo, stage: DeleteStage) {
    const outcome = await remove(branch.name, stage === "force");
    if (outcome === null) return;
    if (outcome.status === "deleted") setDialog(null);
    else setDialog({ type: "delete", branch, stage: "force" });
  }

  if (loadError) {
    return (
      <div className="px-2">
        <ErrorNotice error={loadError} title="No se pudieron cargar las ramas" />
      </div>
    );
  }
  if (!branches) return <p className="px-2 text-sm">Cargando ramas…</p>;

  const locals = branches.filter((b) => b.kind === "local");
  const remotes = branches.filter((b) => b.kind === "remote");

  return (
    <section aria-label="Ramas" className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xs font-semibold uppercase text-muted-foreground">Ramas</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="Crear rama"
          onClick={() => openDialog({ type: "create" })}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>

      {/* Mientras hay un diálogo abierto, el error se muestra dentro de él. */}
      {error && !dialog && (
        <div className="px-2">
          <ErrorNotice error={error} title="No se pudo completar la operación con la rama" />
        </div>
      )}

      <ul aria-label="Ramas locales">
        {locals.map((branch) => (
          <li key={branch.name} className="flex items-center gap-1">
            <button
              type="button"
              disabled={branch.isCurrent || busy}
              aria-current={branch.isCurrent ? "true" : undefined}
              title={branch.isCurrent ? "Rama actual" : `Cambiar a ${branch.name}`}
              onClick={() => void checkout(branch.name)}
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-accent disabled:cursor-default aria-[current=true]:font-semibold aria-[current=true]:bg-accent"
            >
              <span aria-hidden="true" className="w-3 shrink-0">
                {branch.isCurrent ? "●" : ""}
              </span>
              <span className="truncate">{branch.name}</span>
            </button>
            <Sync branch={branch} />
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              disabled={branch.isCurrent || busy}
              aria-label={`Eliminar rama ${branch.name}`}
              title={branch.isCurrent ? "No se puede eliminar la rama actual" : undefined}
              onClick={() => openDialog({ type: "delete", branch, stage: "confirm" })}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>

      {remotes.length > 0 && (
        <>
          <h3 className="px-2 text-xs font-semibold uppercase text-muted-foreground">Remotas</h3>
          <ul aria-label="Ramas remotas">
            {remotes.map((branch) => (
              <li key={branch.name}>
                <button
                  type="button"
                  disabled={busy}
                  title="Cambiar a esta rama (crea la local con seguimiento)"
                  onClick={() => void checkout(branch.name)}
                  className="w-full truncate rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent"
                >
                  {branch.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {dialog?.type === "create" && (
        <CreateBranchDialog
          selectedOid={selectedOid}
          busy={busy}
          error={error}
          onCreate={create}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "delete" && (
        <DeleteBranchDialog
          branch={dialog.branch}
          stage={dialog.stage}
          busy={busy}
          error={error}
          onConfirm={() => void confirmDelete(dialog.branch, dialog.stage)}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}
