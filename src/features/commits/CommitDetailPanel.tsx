import { useEffect, useState } from "react";
import { GitBranch, Tag } from "lucide-react";

import { parseRefs } from "@/features/graph/refs";
import type { CommitDetail } from "@/features/graph/types";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { api, toAppError } from "@/lib/api";
import type { AppError, RepositoryRef } from "@/types/git";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" });

type Props = {
  repository: RepositoryRef;
  oid: string;
  /** Si se pasan, el panel ofrece «Crear rama aquí» y «Crear tag aquí» sobre este commit. */
  onCreateBranch?: (oid: string) => void;
  onCreateTag?: (oid: string) => void;
};

type Load =
  | { phase: "loading" }
  | { phase: "error"; error: AppError }
  | { phase: "ready"; detail: CommitDetail };

// Se remonta (prop `key`) al cambiar de commit: el estado inicial ya es "loading".
export function CommitDetailPanel({ repository, oid, onCreateBranch, onCreateTag }: Props) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });

  useEffect(() => {
    let current = true;
    api
      .getCommit(repository.id, oid)
      .then((detail) => current && setLoad({ phase: "ready", detail }))
      .catch((e: unknown) => current && setLoad({ phase: "error", error: toAppError(e) }));
    return () => {
      current = false;
    };
  }, [repository.id, oid]);

  if (load.phase === "loading") return <p className="p-3 text-sm">Cargando commit…</p>;
  if (load.phase === "error") {
    return (
      <div className="p-3">
        <ErrorNotice error={load.error} title="No se pudo cargar el commit" />
      </div>
    );
  }

  const { detail } = load;
  const labels = parseRefs(detail.refs);
  return (
    <article aria-label="Detalle del commit" className="flex flex-col gap-2 p-3 text-sm">
      {/* Texto plano: React escapa el contenido, nunca se interpreta como HTML. */}
      <h3 className="font-semibold">{detail.subject}</h3>
      {detail.body && <pre className="whitespace-pre-wrap font-sans">{detail.body}</pre>}
      <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Commit</dt>
        <dd className="break-all font-mono">{detail.oid}</dd>
        <dt className="text-muted-foreground">Autor</dt>
        <dd>
          {detail.author} · {dateFormat.format(new Date(detail.authoredAt))}
        </dd>
        <dt className="text-muted-foreground">Committer</dt>
        <dd>
          {detail.committer} · {dateFormat.format(new Date(detail.committedAt))}
        </dd>
        <dt className="text-muted-foreground">Padres</dt>
        <dd className="break-all font-mono">
          {detail.parents.length === 0 ? "—" : detail.parents.map((p) => p.slice(0, 7)).join(", ")}
        </dd>
        {labels.length > 0 && (
          <>
            <dt className="text-muted-foreground">Refs</dt>
            <dd>{labels.map((l) => l.name).join(", ")}</dd>
          </>
        )}
      </dl>
      {(onCreateBranch || onCreateTag) && (
        <div className="flex flex-wrap gap-2">
          {onCreateBranch && (
            <Button variant="outline" size="sm" onClick={() => onCreateBranch(detail.oid)}>
              <GitBranch aria-hidden="true" />
              Crear rama aquí
            </Button>
          )}
          {onCreateTag && (
            <Button variant="outline" size="sm" onClick={() => onCreateTag(detail.oid)}>
              <Tag aria-hidden="true" />
              Crear tag aquí
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
