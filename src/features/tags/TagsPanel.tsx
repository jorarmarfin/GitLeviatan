import { useMemo, useState } from "react";
import { Cloud, CloudOff, Download, Plus, Rocket, Trash2, Upload } from "lucide-react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { SyncProgressBar } from "@/features/sync/SyncProgressBar";
import { useSyncOperation } from "@/features/sync/useSyncOperation";
import { useSyncTarget } from "@/features/sync/useSyncTarget";
import { api } from "@/lib/api";
import type { AppError, RepositoryRef } from "@/types/git";

import { CreateTagDialog } from "./CreateTagDialog";
import { DeleteTagDialog } from "./DeleteTagDialog";
import { mergeTags, type TagRow } from "./mergeTags";
import { ReleaseDialog } from "./ReleaseDialog";
import type { RemoteTag } from "./types";
import { useTags } from "./useTags";

type Props = {
  repository: RepositoryRef;
  selectedOid: string | null;
  /** Sube cuando otra parte de la app cambió el repositorio. */
  externalVersion: number;
  /** Se llama tras una operación con éxito para refrescar grafo, tags y ramas. */
  onChanged: () => void;
};

type Dialog =
  | { type: "create" }
  | { type: "release" }
  | { type: "delete"; tag: TagRow; scope: "local" | "remote" };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function describe(tag: TagRow): string {
  const parts = [tag.kind === "annotated" ? "Anotado" : "Ligero"];
  if (tag.message) parts.push(tag.message);
  parts.push(`commit ${tag.targetOid.slice(0, 7)}`);
  if (tag.taggerDate) parts.push(dateFormat.format(new Date(tag.taggerDate)));
  return parts.join(" · ");
}

function Badge({ children, title }: { children: string; title: string }) {
  return (
    <span
      title={title}
      className="shrink-0 rounded border border-border px-1 text-[0.65rem] text-muted-foreground"
    >
      {children}
    </span>
  );
}

/** Tags locales y remotos: crear, publicar, traer y eliminar, y el asistente de release. */
export function TagsPanel({ repository, selectedOid, externalVersion, onChanged }: Props) {
  const { tags, loadError } = useTags(repository, externalVersion);
  const { remote } = useSyncTarget(repository, externalVersion);
  const sync = useSyncOperation();
  const [remoteTags, setRemoteTags] = useState<RemoteTag[] | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => (tags ? mergeTags(tags, remoteTags) : []), [tags, remoteTags]);

  /** Ejecuta una operación; devuelve `{ value }` si terminó o `null` si falló (error en `error`). */
  async function attempt<T>(
    operation: () => Promise<T>,
    keepNotice = false,
  ): Promise<{ value: T } | null> {
    setError(null);
    if (!keepNotice) setNotice(null);
    const result = await sync.execute(operation);
    if (result.ok) return { value: result.value };
    setError(result.failure);
    return null;
  }

  /** `keepNotice`: refresco tras otra operación, que no debe borrar su mensaje de éxito. */
  async function queryRemote(keepNotice = false) {
    if (!remote) return null;
    const result = await attempt(() => api.listRemoteTags(repository.id, remote), keepNotice);
    if (result) setRemoteTags(result.value);
    return result?.value ?? null;
  }

  async function checkRemote() {
    const found = await queryRemote();
    if (found) setNotice(`El remoto «${remote}» tiene ${found.length} tags.`);
  }

  async function fetchTags() {
    if (!remote) return;
    if (await attempt(() => api.fetchTags(repository.id, remote))) {
      setNotice(`Tags traídos de «${remote}».`);
      onChanged();
      void queryRemote(true);
    }
  }

  async function publish(tag: TagRow) {
    if (!remote) return;
    if (await attempt(() => api.pushTag(repository.id, remote, tag.name))) {
      setNotice(`Tag «${tag.name}» subido a «${remote}».`);
      void queryRemote(true);
    }
  }

  async function confirmDelete(tag: TagRow, scope: "local" | "remote") {
    const operation =
      scope === "local"
        ? () => api.deleteTag(repository.id, tag.name)
        : () => api.deleteRemoteTag(repository.id, remote ?? "", tag.name);
    if (!(await attempt(operation))) return;
    setDialog(null);
    if (scope === "local") onChanged();
    else void queryRemote(true);
  }

  function open(next: Dialog) {
    setError(null);
    setNotice(null);
    setDialog(next);
  }
  function close() {
    setError(null);
    setDialog(null);
  }

  if (loadError) {
    return (
      <div className="px-2">
        <ErrorNotice error={loadError} title="No se pudieron cargar los tags" />
      </div>
    );
  }
  if (!tags) return <p className="px-2 text-sm">Cargando tags…</p>;

  const noRemote = "Este repositorio no tiene remotos";

  return (
    <section aria-label="Tags" className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xs font-semibold uppercase text-muted-foreground">Tags</h2>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Nueva release"
            title="Nueva release"
            onClick={() => open({ type: "release" })}
          >
            <Rocket aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Consultar tags del remoto"
            title={remote ? `Consultar los tags de «${remote}» sin descargarlos` : noRemote}
            disabled={!remote || sync.running}
            onClick={() => void checkRemote()}
          >
            <Cloud aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Traer tags"
            title={remote ? `Traer los tags de «${remote}»` : noRemote}
            disabled={!remote || sync.running}
            onClick={() => void fetchTags()}
          >
            <Download aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Crear tag"
            title="Crear tag"
            onClick={() => open({ type: "create" })}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>

      {sync.running && (
        <div className="flex items-end gap-2 px-2">
          <SyncProgressBar progress={sync.progress} />
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={!sync.canCancel}
            onClick={sync.cancel}
          >
            Cancelar
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {notice}
        </p>
      )}
      {/* Mientras hay un diálogo abierto, el error se muestra dentro de él. */}
      {error && !dialog && (
        <div className="px-2">
          <ErrorNotice error={error} title="No se pudo completar la operación con los tags" />
        </div>
      )}

      {rows.length === 0 && <p className="px-2 text-sm text-muted-foreground">Sin tags.</p>}
      <ul aria-label="Tags del repositorio">
        {rows.map((tag) => (
          <li key={tag.name} className="flex items-center gap-1 px-2 py-0.5">
            <span
              className={`min-w-0 flex-1 truncate text-sm ${tag.existsLocal ? "" : "text-muted-foreground"}`}
              title={describe(tag)}
            >
              {tag.name}
            </span>
            {!tag.existsLocal && <Badge title="Solo existe en el remoto">solo remoto</Badge>}
            {tag.existsLocal && tag.existsRemote === false && (
              <Badge title="Aún no está en el remoto">solo local</Badge>
            )}
            {tag.divergent && (
              <Badge title="El remoto tiene este nombre apuntando a otro commit">otro commit</Badge>
            )}
            {tag.existsLocal && tag.existsRemote !== true && remote && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Subir tag ${tag.name}`}
                title={`Subir «${tag.name}» a «${remote}»`}
                disabled={sync.running}
                onClick={() => void publish(tag)}
              >
                <Upload aria-hidden="true" />
              </Button>
            )}
            {tag.existsLocal && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Eliminar tag ${tag.name}`}
                title="Eliminar el tag local"
                onClick={() => open({ type: "delete", tag, scope: "local" })}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            )}
            {tag.existsRemote === true && remote && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Eliminar tag remoto ${tag.name}`}
                title={`Eliminar «${tag.name}» de «${remote}»`}
                onClick={() => open({ type: "delete", tag, scope: "remote" })}
              >
                <CloudOff aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {dialog?.type === "create" && (
        <CreateTagDialog
          repository={repository}
          selectedOid={selectedOid}
          onChanged={onChanged}
          onClose={close}
        />
      )}
      {dialog?.type === "release" && (
        <ReleaseDialog
          repository={repository}
          remote={remote}
          onChanged={onChanged}
          onPublished={() => void queryRemote(true)}
          onClose={close}
        />
      )}
      {dialog?.type === "delete" && (
        <DeleteTagDialog
          tag={dialog.tag.name}
          targetOid={dialog.tag.targetOid}
          remote={dialog.scope === "remote" ? remote : null}
          busy={sync.running}
          error={error}
          onConfirm={() => void confirmDelete(dialog.tag, dialog.scope)}
          onClose={close}
        />
      )}
    </section>
  );
}
