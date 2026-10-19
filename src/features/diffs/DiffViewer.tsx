import { lazy, Suspense, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useIsDark } from "@/lib/useIsDark";
import type { DiffScope, FileDiff, RepositoryRef } from "@/types/git";

// Monaco es pesado: solo se descarga al abrir el primer diff.
const MonacoDiff = lazy(() => import("./MonacoDiff"));

export type DiffSelection = { path: string; scope: DiffScope };

type Props = { repository: RepositoryRef; selection: DiffSelection | null; refreshKey: number };

type Load =
  { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; diff: FileDiff };

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>;
}

export function DiffViewer({ repository, selection, refreshKey }: Props) {
  if (!selection) return <Notice>Selecciona un archivo para ver su diff.</Notice>;
  return (
    <DiffContent
      key={`${selection.scope}:${selection.path}:${refreshKey}`}
      repository={repository}
      selection={selection}
    />
  );
}

// Se remonta (prop `key`) al cambiar de archivo o de estado: el inicial ya es "loading".
function DiffContent({
  repository,
  selection,
}: {
  repository: RepositoryRef;
  selection: DiffSelection;
}) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const dark = useIsDark();

  useEffect(() => {
    let current = true;
    api
      .getDiff(repository.id, selection.path, selection.scope)
      .then((diff) => current && setLoad({ phase: "ready", diff }))
      .catch((e: unknown) => current && setLoad({ phase: "error", message: errorMessage(e) }));
    return () => {
      current = false;
    };
  }, [repository.id, selection.path, selection.scope]);

  if (load.phase === "loading") return <Notice>Cargando diff…</Notice>;
  if (load.phase === "error") {
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {load.message}
      </p>
    );
  }

  const { diff } = load;
  if (diff.isBinary) return <Notice>Archivo binario: no se muestra el diff.</Notice>;
  if (diff.tooLarge) return <Notice>El archivo supera 1 MiB: no se muestra el diff.</Notice>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
        {selection.scope === "staged" ? "Staged" : "Sin preparar"} · {diff.path}
      </p>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<Notice>Cargando visor…</Notice>}>
          <MonacoDiff
            path={diff.path}
            original={diff.original}
            modified={diff.modified}
            dark={dark}
          />
        </Suspense>
      </div>
    </div>
  );
}
