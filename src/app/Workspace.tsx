import { useCallback, useState } from "react";

import { CommitDetailPanel } from "@/features/commits/CommitDetailPanel";
import { GraphPanel } from "@/features/graph/GraphPanel";
import { ChangesPanel } from "@/features/status/ChangesPanel";
import type { RepositoryRef } from "@/types/git";

// Se remonta (prop `key`) al cambiar de repositorio: la selección se reinicia.
export function Workspace({ repository }: { repository: RepositoryRef }) {
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  // Un commit nuevo cambia el historial: se vuelve a cargar el grafo desde arriba.
  const [graphVersion, setGraphVersion] = useState(0);
  const handleCommitted = useCallback(() => {
    setSelectedOid(null);
    setGraphVersion((v) => v + 1);
  }, []);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_22rem]">
        <main className="min-h-0 overflow-hidden">
          <GraphPanel
            key={graphVersion}
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
            <CommitDetailPanel key={selectedOid} repository={repository} oid={selectedOid} />
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              Selecciona un commit para ver su detalle.
            </p>
          )}
        </aside>
      </div>
      <section aria-label="Cambios" className="h-[45%] min-h-64 shrink-0 border-t border-border">
        <ChangesPanel repository={repository} onCommitted={handleCommitted} />
      </section>
    </div>
  );
}
