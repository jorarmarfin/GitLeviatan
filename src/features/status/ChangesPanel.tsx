import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DiffViewer, type DiffSelection } from "@/features/diffs/DiffViewer";
import { ErrorNotice } from "@/components/ErrorNotice";
import type { ChangedFile, DiffScope, RepositoryRef, RepositoryStatus } from "@/types/git";

import { CHANGE_TEXT, SECTION_DOT, type ChangeTone } from "./changeStyle";
import { CommitBox } from "./CommitBox";
import { useChanges } from "./useChanges";

type Props = {
  repository: RepositoryRef;
  onCommitted: () => void;
  /** Sube cuando otra parte de la app cambió el repositorio (p. ej. al cambiar de rama). */
  externalVersion?: number;
};

type FileRowProps = {
  file: ChangedFile;
  /** Por defecto, el tipo del archivo; las filas sin seguimiento usan `untracked`. */
  tone?: ChangeTone;
  scope: DiffScope;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
};

function FileRow({ file, tone, scope, selected, disabled, onSelect, onToggle }: FileRowProps) {
  const label = file.origPath ? `${file.origPath} → ${file.path}` : file.path;
  const type: ChangeTone = tone ?? file.kind;
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={label}
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-accent aria-pressed:bg-selected"
      >
        <span className={`w-20 shrink-0 text-xs font-medium ${CHANGE_TEXT[type]}`}>{type}</span>
        <span className="truncate">{label}</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={disabled}
        aria-label={`${scope === "staged" ? "Quitar de staged" : "Preparar"} ${file.path}`}
        onClick={onToggle}
      >
        {scope === "staged" ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </Button>
    </li>
  );
}

function UntrackedRow({
  path,
  selected,
  disabled,
  onSelect,
  onStage,
}: {
  path: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onStage: () => void;
}) {
  return (
    <FileRow
      file={{ path, origPath: null, kind: "added" }}
      tone="untracked"
      scope="unstaged"
      selected={selected}
      disabled={disabled}
      onSelect={onSelect}
      onToggle={onStage}
    />
  );
}

/** Cabecera de sección: marca de color, título y el contador como etiqueta. */
function SectionHeader({
  tone,
  title,
  count,
  children,
}: {
  tone: keyof typeof SECTION_DOT;
  title: string;
  count: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <span aria-hidden="true" className={`size-2 rounded-full ${SECTION_DOT[tone]}`} />
        {title}
        <span
          aria-label={`${count} archivos`}
          className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.65rem] font-semibold normal-case text-secondary-foreground"
        >
          {count}
        </span>
      </h3>
      {children}
    </div>
  );
}

function exists(status: RepositoryStatus, selection: DiffSelection): boolean {
  if (selection.scope === "staged") return status.staged.some((f) => f.path === selection.path);
  return (
    status.unstaged.some((f) => f.path === selection.path) ||
    status.untracked.includes(selection.path)
  );
}

export function ChangesPanel({ repository, onCommitted, externalVersion = 0 }: Props) {
  const {
    status,
    loadError,
    busy,
    operationError,
    version,
    stage,
    unstage,
    stageAll,
    unstageAll,
    commit,
  } = useChanges(repository, onCommitted, externalVersion);
  const [selection, setSelection] = useState<DiffSelection | null>(null);

  if (loadError) {
    return (
      <div className="p-3">
        <ErrorNotice error={loadError} title="No se pudo leer el estado del repositorio" />
      </div>
    );
  }
  if (!status) return <p className="p-3 text-sm">Cargando cambios…</p>;

  // Si el archivo ya no está en ese estado (p. ej. tras un commit), se descarta la selección.
  const active = selection && exists(status, selection) ? selection : null;
  const isSelected = (path: string, scope: DiffScope) =>
    active?.path === path && active.scope === scope;
  const clean = status.staged.length + status.unstaged.length + status.untracked.length === 0;

  // Un renombrado en staged se deshace con ambas rutas; si no, quedaría la baja del original.
  const unstagePaths = (file: ChangedFile) =>
    file.kind === "renamed" && file.origPath ? [file.path, file.origPath] : [file.path];

  return (
    <div className="grid h-full min-h-0 grid-cols-[22rem_1fr]">
      <div className="flex min-h-0 flex-col border-r border-border">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm">
              {status.detachedHead ? "HEAD desacoplado" : `Rama: ${status.branch ?? "—"}`}
            </p>
            {status.unstaged.length + status.untracked.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                title="Equivale a git add -A"
                onClick={() => void stageAll()}
              >
                <Plus aria-hidden="true" />
                Preparar todo
              </Button>
            )}
          </div>
          {clean && <p className="text-sm text-muted-foreground">Sin cambios.</p>}

          {status.staged.length > 0 && (
            <section aria-label="Staged" className="mb-4">
              <SectionHeader tone="staged" title="Staged" count={status.staged.length}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  disabled={busy}
                  title="Quita todo de staged sin tocar tus archivos"
                  onClick={() => void unstageAll()}
                >
                  <Minus aria-hidden="true" />
                  Quitar todo
                </Button>
              </SectionHeader>
              <ul>
                {status.staged.map((file) => (
                  <FileRow
                    key={`s:${file.path}`}
                    file={file}
                    scope="staged"
                    selected={isSelected(file.path, "staged")}
                    disabled={busy}
                    onSelect={() => setSelection({ path: file.path, scope: "staged" })}
                    onToggle={() => void unstage(unstagePaths(file))}
                  />
                ))}
              </ul>
            </section>
          )}

          {status.unstaged.length > 0 && (
            <section aria-label="Unstaged" className="mb-4">
              <SectionHeader tone="unstaged" title="Unstaged" count={status.unstaged.length} />
              <ul>
                {status.unstaged.map((file) => (
                  <FileRow
                    key={`u:${file.path}`}
                    file={file}
                    scope="unstaged"
                    selected={isSelected(file.path, "unstaged")}
                    disabled={busy}
                    onSelect={() => setSelection({ path: file.path, scope: "unstaged" })}
                    onToggle={() => void stage([file.path])}
                  />
                ))}
              </ul>
            </section>
          )}

          {status.untracked.length > 0 && (
            <section aria-label="Sin seguimiento">
              <SectionHeader
                tone="untracked"
                title="Sin seguimiento"
                count={status.untracked.length}
              />
              <ul>
                {status.untracked.map((path) => (
                  <UntrackedRow
                    key={`n:${path}`}
                    path={path}
                    selected={isSelected(path, "unstaged")}
                    disabled={busy}
                    onSelect={() => setSelection({ path, scope: "unstaged" })}
                    onStage={() => void stage([path])}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
        <CommitBox
          stagedCount={status.staged.length}
          busy={busy}
          error={operationError}
          onCommit={commit}
        />
      </div>
      <div className="min-h-0 min-w-0">
        <DiffViewer repository={repository} selection={active} refreshKey={version} />
      </div>
    </div>
  );
}
