import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import type { CommitDetail } from "@/features/graph/types";
import { CHANGE_TEXT } from "@/features/status/changeStyle";
import { api, toAppError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIsDark } from "@/lib/useIsDark";
import type {
  AppError,
  CommitFile,
  CommitFileStatus,
  CommitFiles,
  FileDiff,
  RepositoryRef,
} from "@/types/git";

// Monaco es pesado: se comparte con el visor de cambios y solo se descarga al abrir el primer diff.
const MonacoDiff = lazy(() => import("@/features/diffs/MonacoDiff"));

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" });

const STATUS: Record<CommitFileStatus, { letter: string; label: string }> = {
  added: { letter: "A", label: "Añadido" },
  modified: { letter: "M", label: "Modificado" },
  deleted: { letter: "D", label: "Eliminado" },
  renamed: { letter: "R", label: "Renombrado" },
  copied: { letter: "C", label: "Copiado" },
  typechange: { letter: "T", label: "Cambio de tipo" },
};

type Props = {
  repository: RepositoryRef;
  oid: string;
  /** Vuelve al historial. */
  onClose: () => void;
  className?: string;
};

type Load<T> =
  { phase: "loading" } | { phase: "error"; error: AppError } | { phase: "ready"; value: T };

/** Texto «+12 −3», o «binario». */
function Counts({ file }: { file: CommitFile }) {
  if (file.isBinary) return <span className="shrink-0 text-xs text-muted-foreground">binario</span>;
  return (
    <span className="shrink-0 font-mono text-xs">
      <span className="text-change-added">+{file.additions ?? 0}</span>{" "}
      <span className="text-change-deleted">−{file.deletions ?? 0}</span>
    </span>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>;
}

/**
 * Vista a pantalla completa con los archivos que modificó un commit (respecto a su primer
 * padre) y el diff del archivo elegido. `Esc` o **Volver al historial** la cierran.
 */
export function CommitFilesView({ repository, oid, onClose, className }: Props) {
  const [files, setFiles] = useState<Load<CommitFiles>>({ phase: "loading" });
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let current = true;
    api
      .listCommitFiles(repository.id, oid)
      .then((value) => current && setFiles({ phase: "ready", value }))
      .catch((e: unknown) => current && setFiles({ phase: "error", error: toAppError(e) }));
    // La cabecera es un extra: si falla, la lista y el diff siguen funcionando.
    api
      .getCommit(repository.id, oid)
      .then((value) => current && setDetail(value))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [repository.id, oid]);

  const all = useMemo(() => (files.phase === "ready" ? files.value.files : []), [files]);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle === "" ? all : all.filter((f) => f.path.toLowerCase().includes(needle));
  }, [all, filter]);
  // El primer archivo queda seleccionado al abrir y cuando el filtro oculta el elegido.
  const selected = visible.find((f) => f.path === selectedPath) ?? visible[0] ?? null;

  const totals = useMemo(
    () =>
      all.reduce(
        (sum, f) => ({ add: sum.add + (f.additions ?? 0), del: sum.del + (f.deletions ?? 0) }),
        { add: 0, del: 0 },
      ),
    [all],
  );

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.click();
  }

  const subject = detail?.subject ?? "";
  const ready = files.phase === "ready" ? files.value : null;

  return (
    <section
      aria-label="Archivos del commit"
      onKeyDown={onKeyDown}
      className={cn("flex min-h-0 flex-col bg-background", className)}
    >
      <header className="flex flex-col gap-1 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" autoFocus onClick={onClose}>
            <ArrowLeft aria-hidden="true" />
            Volver al historial
          </Button>
          <code className="shrink-0 text-xs text-muted-foreground">{oid.slice(0, 7)}</code>
          <h2 className="min-w-0 flex-1 truncate font-semibold" title={subject}>
            {subject}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {detail && `${detail.author} · ${dateFormat.format(new Date(detail.authoredAt))} · `}
          {ready && (
            <>
              {ready.totalFiles} {ready.totalFiles === 1 ? "archivo" : "archivos"}
              {ready.truncated ? " (se listan los primeros)" : ""}, +{totals.add} −{totals.del}
              {ready.isMerge && ready.comparedWith && (
                <>
                  {" "}
                  · Commit de fusión: cambios respecto al primer padre (
                  <code>{ready.comparedWith.slice(0, 7)}</code>)
                </>
              )}
            </>
          )}
        </p>
      </header>

      {files.phase === "loading" && <Notice>Cargando archivos…</Notice>}
      {files.phase === "error" && (
        <div className="p-4">
          <ErrorNotice error={files.error} title="No se pudieron cargar los archivos del commit" />
        </div>
      )}

      {ready && (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(16rem,26rem)_1fr]">
          <div className="flex min-h-0 flex-col border-r border-border">
            {ready.truncated && (
              <p role="status" className="border-b border-border px-3 py-1 text-xs">
                Se muestran los primeros {ready.files.length} de {ready.totalFiles} archivos.
              </p>
            )}
            {all.length > 0 && (
              <input
                type="search"
                aria-label="Filtrar archivos por nombre"
                placeholder="Filtrar por nombre…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="m-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            )}
            {all.length === 0 && <Notice>Este commit no cambia archivos.</Notice>}
            {all.length > 0 && visible.length === 0 && (
              <Notice>Ningún archivo coincide con «{filter}».</Notice>
            )}
            <ul
              ref={listRef}
              aria-label="Archivos modificados"
              onKeyDown={onListKeyDown}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {visible.map((file) => {
                const { letter, label } = STATUS[file.status];
                const isSelected = file === selected;
                const name = file.origPath ? `${file.origPath} → ${file.path}` : file.path;
                return (
                  <li key={`${file.origPath ?? ""}>${file.path}`}>
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      aria-label={`${name}, ${label}`}
                      title={name}
                      onClick={() => setSelectedPath(file.path)}
                      className="flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-accent aria-[current=true]:bg-selected"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-4 shrink-0 font-mono font-semibold",
                          CHANGE_TEXT[file.status],
                        )}
                      >
                        {letter}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <Counts file={file} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="min-h-0">
            {selected ? (
              <FileDiffPane
                // Se remonta al cambiar de archivo: el estado inicial ya es «cargando».
                key={`${oid}:${selected.origPath ?? ""}>${selected.path}`}
                repository={repository}
                oid={oid}
                file={selected}
              />
            ) : (
              <Notice>Selecciona un archivo para ver su diff.</Notice>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function FileDiffPane({
  repository,
  oid,
  file,
}: {
  repository: RepositoryRef;
  oid: string;
  file: CommitFile;
}) {
  const [load, setLoad] = useState<Load<FileDiff>>({ phase: "loading" });
  const dark = useIsDark();

  useEffect(() => {
    let current = true;
    api
      .getCommitFileDiff(repository.id, oid, file.path, file.origPath)
      .then((value) => current && setLoad({ phase: "ready", value }))
      .catch((e: unknown) => current && setLoad({ phase: "error", error: toAppError(e) }));
    return () => {
      current = false;
    };
  }, [repository.id, oid, file.path, file.origPath]);

  if (load.phase === "loading") return <Notice>Cargando diff…</Notice>;
  if (load.phase === "error") {
    return (
      <div className="p-4">
        <ErrorNotice error={load.error} title="No se pudo cargar el diff" />
      </div>
    );
  }
  const diff = load.value;
  if (diff.isBinary) return <Notice>Archivo binario: no se muestra el diff.</Notice>;
  if (diff.tooLarge) return <Notice>El archivo supera 1 MiB: no se muestra el diff.</Notice>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground">{diff.path}</p>
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
