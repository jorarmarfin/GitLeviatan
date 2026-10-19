import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import type { CommitNode, RepositoryRef } from "@/types/git";

const PAGE_SIZE = 100;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

type Props = { repository: RepositoryRef };

export function CommitList({ repository }: Props) {
  const [commits, setCommits] = useState<CommitNode[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El componente se remonta (prop `key`) al cambiar de repositorio, así que
  // el estado inicial ya es el de "cargando la primera página".
  useEffect(() => {
    let current = true;
    api
      .listCommits(repository.id, null, PAGE_SIZE)
      .then((page) => {
        if (!current) return;
        setCommits(page.commits);
        setNextCursor(page.nextCursor);
        setLoaded(true);
      })
      .catch((e: unknown) => current && setError(errorMessage(e)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [repository.id]);

  async function loadMore(cursor: string) {
    setLoading(true);
    try {
      const page = await api.listCommits(repository.id, cursor, PAGE_SIZE);
      setCommits((prev) => [...prev, ...page.commits]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <p role="alert" className="p-3 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (loading && !loaded) return <p className="p-3 text-sm">Cargando historial…</p>;
  if (loaded && commits.length === 0) {
    return (
      <p className="p-3 text-sm text-muted-foreground">Repositorio vacío: aún no hay commits.</p>
    );
  }

  return (
    <div className="flex flex-col">
      <ul aria-label="Historial de commits" className="divide-y divide-border">
        {commits.map((commit) => (
          <li key={commit.oid} className="flex flex-col gap-0.5 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <code className="text-xs text-muted-foreground">{commit.shortOid}</code>
              <span className="truncate text-sm">{commit.subject}</span>
              {commit.refs.map((ref) => (
                <span key={ref} className="rounded bg-secondary px-1.5 text-xs">
                  {ref}
                </span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              {commit.author} · {dateFormat.format(new Date(commit.authoredAt))}
            </div>
          </li>
        ))}
      </ul>
      {nextCursor && (
        <div className="p-3">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadMore(nextCursor)}
          >
            {loading ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      )}
    </div>
  );
}
