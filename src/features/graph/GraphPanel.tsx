import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import type { CommitNode, RepositoryRef } from "@/types/git";

import { GraphView } from "./GraphView";
import { computeGraphRows } from "./layout";
import type { GraphRow, LayoutState } from "./types";

export const PAGE_SIZE = 500;

type Data = {
  commits: CommitNode[];
  rows: GraphRow[];
  layout: LayoutState;
  nextCursor: string | null;
};

type Props = {
  repository: RepositoryRef;
  selectedOid: string | null;
  onSelect: (oid: string) => void;
};

// Se remonta (prop `key`) al cambiar de repositorio: el estado inicial ya es "cargando".
export function GraphPanel({ repository, selectedOid, onSelect }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api
      .listCommits(repository.id, null, PAGE_SIZE)
      .then((page) => {
        if (!current) return;
        const { rows, state } = computeGraphRows(page.commits);
        setData({ commits: page.commits, rows, layout: state, nextCursor: page.nextCursor });
      })
      .catch((e: unknown) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [repository.id]);

  const nextCursor = data?.nextCursor ?? null;
  const loadMore = useCallback(() => {
    if (nextCursor === null) return;
    setLoadingMore(true);
    api
      .listCommits(repository.id, nextCursor, PAGE_SIZE)
      .then((page) => {
        setData((prev) => {
          if (!prev) return prev;
          const { rows, state } = computeGraphRows(page.commits, prev.layout);
          return {
            commits: [...prev.commits, ...page.commits],
            rows: [...prev.rows, ...rows],
            layout: state,
            nextCursor: page.nextCursor,
          };
        });
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoadingMore(false));
  }, [repository.id, nextCursor]);

  if (error) {
    return (
      <p role="alert" className="p-3 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!data) return <p className="p-3 text-sm">Cargando historial…</p>;
  if (data.commits.length === 0) {
    return (
      <p className="p-3 text-sm text-muted-foreground">Repositorio vacío: aún no hay commits.</p>
    );
  }

  return (
    <GraphView
      commits={data.commits}
      rows={data.rows}
      selectedOid={selectedOid}
      onSelect={onSelect}
      hasMore={nextCursor !== null}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
