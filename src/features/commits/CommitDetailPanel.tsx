import { useEffect, useState } from "react";

import { parseRefs } from "@/features/graph/refs";
import type { CommitDetail } from "@/features/graph/types";
import { api, errorMessage } from "@/lib/api";
import type { RepositoryRef } from "@/types/git";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" });

type Props = { repository: RepositoryRef; oid: string };

type Load =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; detail: CommitDetail };

// Se remonta (prop `key`) al cambiar de commit: el estado inicial ya es "loading".
export function CommitDetailPanel({ repository, oid }: Props) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });

  useEffect(() => {
    let current = true;
    api
      .getCommit(repository.id, oid)
      .then((detail) => current && setLoad({ phase: "ready", detail }))
      .catch((e: unknown) => current && setLoad({ phase: "error", message: errorMessage(e) }));
    return () => {
      current = false;
    };
  }, [repository.id, oid]);

  if (load.phase === "loading") return <p className="p-3 text-sm">Cargando commit…</p>;
  if (load.phase === "error") {
    return (
      <p role="alert" className="p-3 text-sm text-destructive">
        {load.message}
      </p>
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
    </article>
  );
}
