import { useState } from "react";

import { CommitDetailPanel } from "@/features/commits/CommitDetailPanel";
import { GraphPanel } from "@/features/graph/GraphPanel";
import { StatusPanel } from "@/features/status/StatusPanel";
import type { RepositoryRef } from "@/types/git";

// Se remonta (prop `key`) al cambiar de repositorio: la selección se reinicia.
export function Workspace({ repository }: { repository: RepositoryRef }) {
  const [selectedOid, setSelectedOid] = useState<string | null>(null);

  return (
    <>
      <main className="min-h-0 overflow-hidden">
        <GraphPanel repository={repository} selectedOid={selectedOid} onSelect={setSelectedOid} />
      </main>
      <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-border">
        <section aria-label="Commit seleccionado" className="border-b border-border">
          {selectedOid ? (
            <CommitDetailPanel key={selectedOid} repository={repository} oid={selectedOid} />
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              Selecciona un commit para ver su detalle.
            </p>
          )}
        </section>
        <section aria-label="Cambios">
          <StatusPanel repository={repository} />
        </section>
      </aside>
    </>
  );
}
