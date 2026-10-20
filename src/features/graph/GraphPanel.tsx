import { useCallback, useEffect, useState } from "react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { api, toAppError } from "@/lib/api";
import type { AppError, CommitNode, RepositoryRef } from "@/types/git";

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
  /** Doble clic o Enter sobre un commit: abre sus archivos. */
  onOpen?: (oid: string) => void;
  /** Clic derecho (o tecla de menú) sobre un commit. */
  onContextMenu?: (oid: string, position: { x: number; y: number }) => void;
};

// Se remonta (prop `key`) al cambiar de repositorio: el estado inicial ya es "cargando".
export function GraphPanel({ repository, selectedOid, onSelect, onOpen, onContextMenu }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let current = true;
    api
      .listCommits(repository.id, null, PAGE_SIZE)
      .then((page) => {
        if (!current) return;
        const { rows, state } = computeGraphRows(page.commits);
        setData({ commits: page.commits, rows, layout: state, nextCursor: page.nextCursor });
      })
      .catch((e: unknown) => current && setError(toAppError(e)));
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
      .catch((e: unknown) => setError(toAppError(e)))
      .finally(() => setLoadingMore(false));
  }, [repository.id, nextCursor]);

  if (error) {
    return (
      <div className="p-3">
        <ErrorNotice error={error} title="No se pudo cargar el historial" />
      </div>
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
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      hasMore={nextCursor !== null}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
