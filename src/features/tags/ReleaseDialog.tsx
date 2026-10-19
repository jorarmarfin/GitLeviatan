import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SyncProgressBar } from "@/features/sync/SyncProgressBar";
import { useSyncOperation } from "@/features/sync/useSyncOperation";
import { api, toAppError } from "@/lib/api";
import type { AppError, RepositoryRef } from "@/types/git";

import type { ReleaseSuggestion } from "./types";

type Props = {
  repository: RepositoryRef;
  /** Remoto al que subir el tag; `null` si el repositorio no tiene. */
  remote: string | null;
  /** Se llama tras crear el tag (y subirlo), para refrescar tags y grafo. */
  onChanged: () => void;
  /** Se llama tras subir el tag al remoto. */
  onPublished: () => void;
  onClose: () => void;
};

type Bump = "patch" | "minor" | "major" | "custom";

type Phase =
  | { name: "loading" }
  | { name: "form" }
  | { name: "creating" }
  | { name: "pushing" }
  // El tag ya existe en local; solo falló la subida y se puede reintentar.
  | { name: "pushFailed"; tag: string; error: AppError }
  | { name: "done"; tag: string; pushed: boolean }
  | { name: "loadFailed"; error: AppError };

const BUMP_LABEL: Record<Exclude<Bump, "custom">, string> = {
  patch: "Parche",
  minor: "Menor",
  major: "Mayor",
};

const SHOWN_COMMITS = 50;
const FIELD = "rounded-md border border-input bg-background px-2 py-1.5 text-sm";

/**
 * Asistente de release: elige la versión (sugerida a partir del último tag semántico), crea
 * un tag anotado y, si se pide, lo sube al remoto. Los commits listados son solo una ayuda
 * para redactar el mensaje; no se escribe ningún archivo.
 */
export function ReleaseDialog({ repository, remote, onChanged, onPublished, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [suggestion, setSuggestion] = useState<ReleaseSuggestion | null>(null);
  const [bump, setBump] = useState<Bump>("custom");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [commit, setCommit] = useState("");
  const [push, setPush] = useState(remote !== null);
  const [error, setError] = useState<AppError | null>(null);
  const sync = useSyncOperation();

  useEffect(() => {
    let current = true;
    api
      .releaseSuggestion(repository.id)
      .then((next) => {
        if (!current) return;
        setSuggestion(next);
        setBump(next.patch ? "patch" : "custom");
        setPhase({ name: "form" });
      })
      .catch((e: unknown) => current && setPhase({ name: "loadFailed", error: toAppError(e) }));
    return () => {
      current = false;
    };
  }, [repository.id]);

  const version = (bump === "custom" ? custom : (suggestion?.[bump] ?? "")).trim();
  const busy = phase.name === "creating" || phase.name === "pushing";

  async function pushTag(tag: string) {
    if (!remote) return;
    setPhase({ name: "pushing" });
    const result = await sync.execute(() => api.pushTag(repository.id, remote, tag));
    if (result.ok) {
      onPublished();
      setPhase({ name: "done", tag, pushed: true });
    } else {
      setPhase({ name: "pushFailed", tag, error: result.failure });
    }
  }

  async function submit() {
    setError(null);
    setPhase({ name: "creating" });
    try {
      await api.createTag(
        repository.id,
        version,
        commit.trim() || null,
        message.trim() || `Release ${version}`,
      );
    } catch (e) {
      setError(toAppError(e));
      setPhase({ name: "form" });
      return;
    }
    onChanged();
    if (push && remote) await pushTag(version);
    else setPhase({ name: "done", tag: version, pushed: false });
  }

  const finished = phase.name === "done" || phase.name === "pushFailed";

  return (
    <Modal title="Nueva release" onClose={busy ? () => {} : onClose}>
      <div className="flex flex-col gap-3 text-sm">
        {phase.name === "loading" && (
          <p role="status" className="text-muted-foreground">
            Buscando el último tag…
          </p>
        )}
        {phase.name === "loadFailed" && (
          <ErrorNotice error={phase.error} title="No se pudo preparar la release" />
        )}

        {suggestion && !finished && phase.name !== "pushing" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (version !== "" && !busy) void submit();
            }}
          >
            {suggestion.behindUpstream > 0 && (
              <p role="alert" className="text-destructive">
                Tu rama va {suggestion.behindUpstream}{" "}
                {suggestion.behindUpstream === 1 ? "commit" : "commits"} por detrás de su upstream.
                Haz pull antes de publicar la release.
              </p>
            )}

            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1">
                Versión
                {suggestion.lastTag && (
                  <span className="text-muted-foreground"> (último tag: {suggestion.lastTag})</span>
                )}
              </legend>
              {suggestion.patch === null && (
                <p className="text-xs text-muted-foreground">
                  No hay un tag de versión previo (vX.Y.Z); escribe el nombre.
                </p>
              )}
              {(["patch", "minor", "major"] as const).map((kind) => {
                const value = suggestion[kind];
                if (value === null) return null;
                return (
                  <label key={kind} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="release-bump"
                      checked={bump === kind}
                      onChange={() => setBump(kind)}
                    />
                    {BUMP_LABEL[kind]}: <code>{value}</code>
                  </label>
                );
              })}
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="release-bump"
                  checked={bump === "custom"}
                  onChange={() => setBump("custom")}
                />
                Otra
              </label>
              {bump === "custom" && (
                <input
                  autoFocus
                  aria-label="Nombre del tag"
                  placeholder="v1.0.0"
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  className={`${FIELD} font-mono`}
                />
              )}
            </fieldset>

            <label className="flex flex-col gap-1">
              Mensaje del tag
              <textarea
                rows={3}
                value={message}
                placeholder={version ? `Release ${version}` : "Release"}
                onChange={(event) => setMessage(event.target.value)}
                className={FIELD}
              />
            </label>

            <label className="flex flex-col gap-1">
              Commit (vacío = HEAD)
              <input
                value={commit}
                placeholder="HEAD"
                onChange={(event) => setCommit(event.target.value)}
                className={`${FIELD} font-mono`}
              />
            </label>

            <section aria-label="Commits incluidos" className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                {suggestion.lastTag
                  ? `Commits desde ${suggestion.lastTag}`
                  : "Commits de la rama actual"}{" "}
                ({suggestion.commitsSinceLastTag.length})
              </h3>
              {suggestion.commitsSinceLastTag.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay commits nuevos.</p>
              ) : (
                <ul className="max-h-32 overflow-y-auto text-xs">
                  {suggestion.commitsSinceLastTag.slice(0, SHOWN_COMMITS).map((c) => (
                    <li key={c.oid} className="truncate">
                      <code className="text-muted-foreground">{c.oid.slice(0, 7)}</code> {c.subject}
                    </li>
                  ))}
                  {suggestion.commitsSinceLastTag.length > SHOWN_COMMITS && (
                    <li className="text-muted-foreground">…</li>
                  )}
                </ul>
              )}
            </section>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={push && remote !== null}
                disabled={remote === null}
                onChange={(event) => setPush(event.target.checked)}
              />
              {remote
                ? `Subir el tag a «${remote}» al terminar`
                : "Sin remoto: el tag se queda en local"}
            </label>

            {error && <ErrorNotice error={error} title="No se pudo crear el tag" />}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={version === "" || busy}>
                <Rocket aria-hidden="true" />
                {phase.name === "creating" ? "Creando…" : "Crear release"}
              </Button>
            </div>
          </form>
        )}

        {phase.name === "pushing" && (
          <div className="flex items-end gap-3">
            <SyncProgressBar progress={sync.progress} />
            <Button variant="outline" size="sm" disabled={!sync.canCancel} onClick={sync.cancel}>
              Cancelar
            </Button>
          </div>
        )}

        {phase.name === "pushFailed" && (
          <>
            <p role="status">
              El tag <strong>«{phase.tag}»</strong> se creó en local, pero no se pudo subir.
            </p>
            <ErrorNotice error={phase.error} title="No se pudo subir el tag" />
          </>
        )}

        {phase.name === "done" && (
          <p role="status">
            Release <strong>«{phase.tag}»</strong> creada
            {phase.pushed ? ` y subida a «${remote}»` : " en local"}.
            {!phase.pushed && " Puedes subirla desde la lista de tags."}
          </p>
        )}

        {finished && (
          <div className="flex justify-end gap-2">
            {phase.name === "pushFailed" && (
              <Button size="sm" onClick={() => void pushTag(phase.tag)}>
                Reintentar subida
              </Button>
            )}
            <Button variant="outline" size="sm" autoFocus onClick={onClose}>
              Cerrar
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
