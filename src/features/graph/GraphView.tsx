import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, UIEvent } from "react";

import { cn } from "@/lib/utils";
import type { CommitNode } from "@/types/git";

import { parseRefs } from "./refs";
import type { GraphEdge, GraphRow } from "./types";
import { ROW_HEIGHT, visibleRange } from "./virtual";

const LANE_WIDTH = 16;
const PALETTE_SIZE = 8;
const LOAD_AHEAD_ROWS = 50;
const DEFAULT_VIEWPORT = 600;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const laneX = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;
const color = (index: number) => `var(--graph-${index % PALETTE_SIZE})`;

function edgePath(edge: GraphEdge, nodeLane: number): string {
  const mid = ROW_HEIGHT / 2;
  const xFrom = laneX(edge.fromLane);
  const xTo = laneX(edge.toLane);
  switch (edge.kind) {
    case "straight":
      return `M ${xFrom} 0 L ${xTo} ${ROW_HEIGHT}`;
    case "fork":
      return xFrom === xTo
        ? `M ${xFrom} 0 L ${xTo} ${mid}`
        : `M ${xFrom} 0 C ${xFrom} ${mid * 0.8} ${laneX(nodeLane)} ${mid * 0.2} ${laneX(nodeLane)} ${mid}`;
    case "merge":
      return xFrom === xTo
        ? `M ${xFrom} ${mid} L ${xTo} ${ROW_HEIGHT}`
        : `M ${xFrom} ${mid} C ${xFrom} ${mid + mid * 0.8} ${xTo} ${mid + mid * 0.2} ${xTo} ${ROW_HEIGHT}`;
  }
}

type RowProps = {
  commit: CommitNode;
  row: GraphRow;
  top: number;
  selected: boolean;
  graphWidth: number;
  onSelect: (oid: string) => void;
  onOpen?: (oid: string) => void;
};

const GraphRowView = memo(function GraphRowView({
  commit,
  row,
  top,
  selected,
  graphWidth,
  onSelect,
  onOpen,
}: RowProps) {
  const labels = parseRefs(commit.refs);
  const isMerge = commit.parents.length > 1;
  return (
    <div
      id={`graph-row-${commit.oid}`}
      role="option"
      aria-selected={selected}
      aria-label={`${commit.subject}, ${commit.author}${isMerge ? ", merge" : ""}`}
      onClick={() => onSelect(commit.oid)}
      onDoubleClick={() => onOpen?.(commit.oid)}
      style={{ position: "absolute", top, left: 0, right: 0, height: ROW_HEIGHT }}
      className={cn(
        "flex cursor-pointer items-center gap-2 px-2 text-sm hover:bg-accent/60",
        selected && "bg-selected",
      )}
    >
      <svg width={graphWidth} height={ROW_HEIGHT} aria-hidden="true" className="shrink-0">
        {row.edges.map((edge, i) => (
          <path
            key={i}
            d={edgePath(edge, row.lane)}
            stroke={color(edge.colorIndex)}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        <circle
          cx={laneX(row.lane)}
          cy={ROW_HEIGHT / 2}
          r={4.5}
          stroke={color(row.colorIndex)}
          strokeWidth={2}
          fill={isMerge ? "var(--background)" : color(row.colorIndex)}
        />
      </svg>
      {labels.map((label) => (
        <span
          key={`${label.kind}:${label.name}`}
          data-ref-kind={label.kind}
          className={cn(
            "shrink-0 rounded px-1.5 text-xs",
            label.kind === "head" && "bg-primary text-primary-foreground",
            label.kind === "local" && "bg-secondary",
            label.kind === "remote" && "border border-border",
            label.kind === "tag" && "bg-accent italic",
          )}
        >
          {label.name}
        </span>
      ))}
      <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
      <code className="shrink-0 text-xs text-muted-foreground">{commit.shortOid}</code>
      <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground md:inline">
        {commit.author}
      </span>
      <time className="hidden w-36 shrink-0 text-xs text-muted-foreground lg:inline">
        {dateFormat.format(new Date(commit.authoredAt))}
      </time>
    </div>
  );
});

type Props = {
  commits: CommitNode[];
  rows: GraphRow[];
  selectedOid: string | null;
  onSelect: (oid: string) => void;
  /** Doble clic o Enter sobre un commit: abre sus archivos. */
  onOpen?: (oid: string) => void;
  /** Clic derecho (o tecla de menú) sobre un commit; ya lo ha seleccionado. */
  onContextMenu?: (oid: string, position: { x: number; y: number }) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

export function GraphView({
  commits,
  rows,
  selectedOid,
  onSelect,
  onOpen,
  onContextMenu,
  hasMore,
  loadingMore,
  onLoadMore,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);

  const count = commits.length;
  const { start, end } = visibleRange(scrollTop, viewport, count);

  const graphWidth = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.laneCount), 1) * LANE_WIDTH,
    [rows],
  );
  const selectedIndex = useMemo(
    () => (selectedOid === null ? -1 : commits.findIndex((c) => c.oid === selectedOid)),
    [commits, selectedOid],
  );

  // Alto de la ventana: se actualiza al redimensionar (si el entorno lo soporta).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight || DEFAULT_VIEWPORT));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pide la página siguiente al acercarse al final de lo cargado.
  useEffect(() => {
    if (hasMore && !loadingMore && end >= count - LOAD_AHEAD_ROWS) onLoadMore();
  }, [hasMore, loadingMore, end, count, onLoadMore]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
    setViewport(event.currentTarget.clientHeight || DEFAULT_VIEWPORT);
  }

  function ensureVisible(index: number) {
    const el = containerRef.current;
    if (!el) return;
    const rowTop = index * ROW_HEIGHT;
    const height = el.clientHeight || viewport;
    if (rowTop < el.scrollTop) el.scrollTop = rowTop;
    else if (rowTop + ROW_HEIGHT > el.scrollTop + height)
      el.scrollTop = rowTop + ROW_HEIGHT - height;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return;
    const page = Math.max(1, Math.floor(viewport / ROW_HEIGHT) - 1);
    let next: number;
    switch (event.key) {
      case "Enter":
        if (selectedOid !== null && onOpen) {
          event.preventDefault();
          onOpen(selectedOid);
        }
        return;
      case "ArrowDown":
        next = Math.min(count - 1, selectedIndex + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, selectedIndex - 1);
        break;
      case "PageDown":
        next = Math.min(count - 1, Math.max(0, selectedIndex) + page);
        break;
      case "PageUp":
        next = Math.max(0, selectedIndex - page);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== selectedIndex) {
      onSelect(commits[next].oid);
      ensureVisible(next);
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (!onContextMenu) return;
    event.preventDefault();
    const row = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (row) {
      // Clic derecho: la fila bajo el puntero (el id es `graph-row-<oid>`).
      const oid = row.id.slice("graph-row-".length);
      onSelect(oid);
      onContextMenu(oid, { x: event.clientX, y: event.clientY });
      return;
    }
    // Tecla de menú o Mayús+F10: el menú sale junto a la fila seleccionada.
    if (selectedOid === null) return;
    const rect = document.getElementById(`graph-row-${selectedOid}`)?.getBoundingClientRect();
    onContextMenu(selectedOid, {
      x: rect ? rect.left + 48 : event.clientX,
      y: rect ? rect.bottom : event.clientY,
    });
  }

  const visible = [];
  for (let i = start; i < end; i++) {
    visible.push(
      <GraphRowView
        key={commits[i].oid}
        commit={commits[i]}
        row={rows[i]}
        top={i * ROW_HEIGHT}
        selected={i === selectedIndex}
        graphWidth={graphWidth}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      tabIndex={0}
      aria-label="Historial de commits"
      aria-activedescendant={selectedOid ? `graph-row-${selectedOid}` : undefined}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      className="h-full overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div style={{ height: count * ROW_HEIGHT, position: "relative" }}>{visible}</div>
      {loadingMore && <p className="p-2 text-xs text-muted-foreground">Cargando más…</p>}
    </div>
  );
}
