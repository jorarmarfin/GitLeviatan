import { useState } from "react";
import type { MouseEvent } from "react";
import { GitMerge, Plus, Trash2 } from "lucide-react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu";
import type { RepositoryRef } from "@/types/git";

import { CreateBranchDialog } from "./CreateBranchDialog";
import { DeleteBranchDialog, type DeleteStage } from "./DeleteBranchDialog";
import { MergeDialog } from "./MergeDialog";
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

type Dialog =
  | { type: "create"; from?: string }
  | { type: "delete"; branch: BranchInfo; stage: DeleteStage }
  | { type: "merge"; source: string };

type Menu = { branch: BranchInfo; x: number; y: number };

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
  const { branches, loadError, busy, error, clearError, checkout, remove } = useBranches(
    repository,
    externalVersion,
    onChanged,
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  function openDialog(next: Dialog) {
    clearError();
    setDialog(next);
  }
  function openMenu(event: MouseEvent, branch: BranchInfo) {
    event.preventDefault();
    setMenu({ branch, x: event.clientX, y: event.clientY });
  }

  function menuItems({ branch }: Menu): ContextMenuItem[] {
    const isLocal = branch.kind === "local";
    return [
      {
        label: `Fusionar «${branch.name}» en la rama actual`,
        disabled: branch.isCurrent || busy,
        hint: branch.isCurrent ? "Es la rama actual" : undefined,
        onSelect: () => openDialog({ type: "merge", source: branch.name }),
      },
      {
        label: "Cambiar a esta rama",
        disabled: branch.isCurrent || busy,
        hint: branch.isCurrent ? "Ya estás en esta rama" : undefined,
        onSelect: () => void checkout(branch.name),
      },
      {
        label: "Crear rama desde aquí…",
        disabled: busy,
        onSelect: () => openDialog({ type: "create", from: branch.name }),
      },
      ...(isLocal
        ? [
            {
              label: "Eliminar rama…",
              destructive: true,
              disabled: branch.isCurrent || busy,
              hint: "No se puede eliminar la rama actual",
              onSelect: () => openDialog({ type: "delete", branch, stage: "confirm" as const }),
            },
          ]
        : []),
    ];
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
          <li
            key={branch.name}
            className="flex items-center gap-1"
            onContextMenu={(event) => openMenu(event, branch)}
          >
            <button
              type="button"
              // Con `aria-disabled` (no `disabled`) el clic derecho sigue llegando a la fila y abre
              // el menú también sobre la rama actual.
              aria-disabled={branch.isCurrent || busy}
              aria-current={branch.isCurrent ? "true" : undefined}
              title={branch.isCurrent ? "Rama actual" : `Cambiar a ${branch.name}`}
              onClick={() => {
                if (!branch.isCurrent && !busy) void checkout(branch.name);
              }}
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-accent aria-disabled:cursor-default aria-[current=true]:font-semibold aria-[current=true]:bg-selected"
            >
              <span aria-hidden="true" className="w-3 shrink-0 text-primary">
                {branch.isCurrent ? "●" : ""}
              </span>
              <span className="truncate">{branch.name}</span>
            </button>
            <Sync branch={branch} />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 gap-1 px-1.5 text-xs"
              disabled={branch.isCurrent || busy}
              aria-label={`Fusionar «${branch.name}» en la rama actual`}
              title={
                branch.isCurrent
                  ? "Es la rama actual"
                  : `Fusionar «${branch.name}» en la rama actual`
              }
              onClick={() => openDialog({ type: "merge", source: branch.name })}
            >
              <GitMerge aria-hidden="true" />
              Fusionar
            </Button>
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
              <li
                key={branch.name}
                className="flex items-center gap-1"
                onContextMenu={(event) => openMenu(event, branch)}
              >
                <button
                  type="button"
                  disabled={busy}
                  title="Cambiar a esta rama (crea la local con seguimiento)"
                  onClick={() => void checkout(branch.name)}
                  className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent"
                >
                  {branch.name}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 gap-1 px-1.5 text-xs"
                  disabled={busy}
                  aria-label={`Fusionar «${branch.name}» en la rama actual`}
                  title={`Fusionar «${branch.name}» en la rama actual`}
                  onClick={() => openDialog({ type: "merge", source: branch.name })}
                >
                  <GitMerge aria-hidden="true" />
                  Fusionar
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {dialog?.type === "create" && (
        <CreateBranchDialog
          repository={repository}
          selectedOid={selectedOid}
          initialStart={dialog.from ? { kind: "branch", value: dialog.from } : undefined}
          onChanged={onChanged}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "merge" && (
        <MergeDialog
          repository={repository}
          source={dialog.source}
          onChanged={onChanged}
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
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={`Acciones de «${menu.branch.name}»`}
          items={menuItems(menu)}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}
