import { useCallback, useState } from "react";

import { Sidebar } from "@/app/Sidebar";
import { BranchesPanel } from "@/features/branches/BranchesPanel";
import { CreateBranchDialog } from "@/features/branches/CreateBranchDialog";
import { CommitDetailPanel } from "@/features/commits/CommitDetailPanel";
import { GraphPanel } from "@/features/graph/GraphPanel";
import { ChangesPanel } from "@/features/status/ChangesPanel";
import { RemotesPanel } from "@/features/sync/RemotesPanel";
import { SyncBar } from "@/features/sync/SyncBar";
import { CreateTagDialog } from "@/features/tags/CreateTagDialog";
import { TagsPanel } from "@/features/tags/TagsPanel";
import type { RepositoryRef } from "@/types/git";

/** Diálogo abierto desde el commit seleccionado («Crear rama aquí», «Crear tag aquí»). */
type CommitDialog = { type: "branch" | "tag"; oid: string };

// Se remonta (prop `key`) al cambiar de repositorio: la selección se reinicia.
export function Workspace({ repository }: { repository: RepositoryRef }) {
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  // Sube cada vez que algo cambia el repositorio (commit, cambio de rama…): el grafo se
  // recarga desde arriba y el estado y la lista de ramas se vuelven a leer.
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const [commitDialog, setCommitDialog] = useState<CommitDialog | null>(null);
  const closeCommitDialog = useCallback(() => setCommitDialog(null), []);
  const handleCommitted = useCallback(() => {
    setSelectedOid(null);
    refresh();
  }, [refresh]);

  return (
    <>
      <Sidebar>
        <BranchesPanel
          repository={repository}
          selectedOid={selectedOid}
          externalVersion={version}
          onChanged={refresh}
        />
        <TagsPanel
          repository={repository}
          selectedOid={selectedOid}
          externalVersion={version}
          onChanged={refresh}
        />
        <RemotesPanel repository={repository} externalVersion={version} />
      </Sidebar>
      <div className="flex min-h-0 flex-col">
        <SyncBar repository={repository} externalVersion={version} onChanged={refresh} />
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_22rem]">
          <main data-area="graph" className="min-h-0 overflow-hidden">
            <GraphPanel
              key={version}
              repository={repository}
              selectedOid={selectedOid}
              onSelect={setSelectedOid}
            />
          </main>
          <aside
            aria-label="Commit seleccionado"
            className="min-h-0 overflow-y-auto border-l border-border"
          >
            {selectedOid ? (
              <CommitDetailPanel
                key={selectedOid}
                repository={repository}
                oid={selectedOid}
                onCreateBranch={(oid) => setCommitDialog({ type: "branch", oid })}
                onCreateTag={(oid) => setCommitDialog({ type: "tag", oid })}
              />
            ) : (
              <p className="p-3 text-sm text-muted-foreground">
                Selecciona un commit para ver su detalle.
              </p>
            )}
          </aside>
        </div>
        <section
          aria-label="Cambios"
          data-area="changes"
          className="h-[45%] min-h-64 shrink-0 border-t border-border"
        >
          <ChangesPanel
            repository={repository}
            onCommitted={handleCommitted}
            externalVersion={version}
          />
        </section>
      </div>
      {commitDialog?.type === "branch" && (
        <CreateBranchDialog
          repository={repository}
          selectedOid={commitDialog.oid}
          initialStart={{ kind: "commit", value: "" }}
          onChanged={refresh}
          onClose={closeCommitDialog}
        />
      )}
      {commitDialog?.type === "tag" && (
        <CreateTagDialog
          repository={repository}
          selectedOid={commitDialog.oid}
          initialStart={{ kind: "commit", value: "" }}
          onChanged={refresh}
          onClose={closeCommitDialog}
        />
      )}
    </>
  );
}
