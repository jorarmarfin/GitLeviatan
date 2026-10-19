import { useCallback, useEffect, useState } from "react";
import { GitMerge } from "lucide-react";

import { ErrorNotice } from "@/components/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, toAppError } from "@/lib/api";
import type { AppError, RepositoryRef } from "@/types/git";

import type { MergePreview, MergeResult } from "./types";

type Props = {
  repository: RepositoryRef;
  /** Rama a fusionar en la rama actual (local, o remota como `origin/main`). */
  source: string;
  /** Se llama tras una fusión que cambió el repositorio, para refrescar grafo, estado y ramas. */
  onChanged: () => void;
  onClose: () => void;
};

type Phase =
  | { name: "loading" }
  | { name: "ready"; preview: MergePreview }
  | { name: "merging"; preview: MergePreview }
  | { name: "done"; preview: MergePreview; result: MergeResult }
  | { name: "failed"; stage: "preview" | "merge"; error: AppError; preview: MergePreview | null };

const shortOid = (oid: string) => oid.slice(0, 7);

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Por qué no se puede fusionar, o `null` si se puede. */
function blockedMessage(preview: MergePreview): string | null {
  const { blocked } = preview;
  if (!blocked) return null;
  if (blocked.reason === "detachedHead") {
    return "No se puede fusionar con el HEAD desacoplado. Cámbiate a una rama antes.";
  }
  return `Hay cambios sin confirmar en: ${blocked.files.join(", ")}. Confírmalos o descártalos antes de fusionar.`;
}

/**
 * Fusiona una rama en la rama actual: vista previa, confirmación y resultado. Con conflictos
 * la fusión se cancela sola en el backend y aquí solo se informa de los archivos afectados.
 */
export function MergeDialog({ repository, source, onChanged, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });

  useEffect(() => {
    let current = true;
    api
      .mergePreview(repository.id, source)
      .then((preview) => current && setPhase({ name: "ready", preview }))
      .catch(
        (e: unknown) =>
          current &&
          setPhase({ name: "failed", stage: "preview", error: toAppError(e), preview: null }),
      );
    return () => {
      current = false;
    };
  }, [repository.id, source]);

  const merging = phase.name === "merging";
  // Mientras Git trabaja no se puede cerrar: la operación sigue y el resultado se perdería.
  const guardedClose = useCallback(() => {
    if (!merging) onClose();
  }, [merging, onClose]);

  async function merge(preview: MergePreview) {
    setPhase({ name: "merging", preview });
    try {
      const result = await api.mergeBranch(repository.id, source);
      setPhase({ name: "done", preview, result });
      if (result.status === "fastForward" || result.status === "merged") onChanged();
    } catch (e) {
      setPhase({ name: "failed", stage: "merge", error: toAppError(e), preview });
    }
  }

  const preview =
    phase.name === "failed" ? phase.preview : phase.name === "loading" ? null : phase.preview;
  const title = preview
    ? `Fusionar «${preview.source}» en «${preview.target}»`
    : `Fusionar «${source}»`;
  const finished = phase.name === "done";
  const blocked = preview ? blockedMessage(preview) : null;
  const canMerge =
    (phase.name === "ready" || (phase.name === "failed" && phase.stage === "merge")) &&
    preview !== null &&
    blocked === null &&
    !preview.upToDate;

  return (
    <Modal title={title} onClose={guardedClose}>
      <div className="flex flex-col gap-3 text-sm">
        {phase.name === "loading" && (
          <p role="status" className="text-muted-foreground">
            Calculando qué se fusionaría…
          </p>
        )}

        {phase.name === "failed" && (
          <ErrorNotice
            error={phase.error}
            title={
              phase.stage === "preview" ? "No se pudo preparar la fusión" : "No se pudo fusionar"
            }
          />
        )}

        {preview && phase.name !== "done" && <PreviewBody preview={preview} blocked={blocked} />}

        {phase.name === "done" && <ResultBody preview={phase.preview} result={phase.result} />}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" autoFocus disabled={merging} onClick={guardedClose}>
            {finished ? "Cerrar" : "Cancelar"}
          </Button>
          {!finished && (
            <Button size="sm" disabled={!canMerge} onClick={() => preview && void merge(preview)}>
              <GitMerge aria-hidden="true" />
              {merging ? "Fusionando…" : "Fusionar"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PreviewBody({ preview, blocked }: { preview: MergePreview; blocked: string | null }) {
  const remote = preview.source.includes("/");
  return (
    <>
      {blocked ? (
        <p role="alert" className="text-destructive">
          {blocked}
        </p>
      ) : preview.upToDate ? (
        <p>
          <strong>«{preview.source}»</strong> ya está incluida en{" "}
          <strong>«{preview.target}»</strong>. No hay nada que fusionar.
        </p>
      ) : (
        <>
          <p>
            Entrarán <strong>{plural(preview.commitsToMerge, "commit", "commits")}</strong> de{" "}
            <strong>«{preview.source}»</strong> en <strong>«{preview.target}»</strong>.
          </p>
          <p>
            {preview.fastForward
              ? `«${preview.target}» solo avanzará hasta «${preview.source}»: no se creará un commit de fusión.`
              : `Se creará un commit de fusión en «${preview.target}».`}
          </p>
        </>
      )}
      {!blocked && !preview.upToDate && (
        <p className="text-muted-foreground">
          Si hay conflictos, la fusión se cancelará sola y no se cambiará nada.
        </p>
      )}
      {remote && !blocked && !preview.upToDate && (
        <p className="text-xs text-muted-foreground">
          Es una rama remota: si no la has actualizado, haz Fetch antes de fusionar.
        </p>
      )}
    </>
  );
}

function ResultBody({ preview, result }: { preview: MergePreview; result: MergeResult }) {
  switch (result.status) {
    case "upToDate":
      return (
        <p role="status">
          <strong>«{preview.source}»</strong> ya estaba incluida: no se cambió nada.
        </p>
      );
    case "fastForward":
      return (
        <p role="status">
          <strong>«{preview.target}»</strong> avanzó hasta <code>{shortOid(result.oid)}</code> (
          {plural(preview.commitsToMerge, "commit", "commits")} de «{preview.source}»).
        </p>
      );
    case "merged":
      return (
        <p role="status">
          Fusión completada: se creó el commit de fusión <code>{shortOid(result.oid)}</code> en{" "}
          <strong>«{preview.target}»</strong>.
        </p>
      );
    case "conflict":
      return (
        <div role="alert" className="flex flex-col gap-2">
          <p className="font-semibold text-destructive">
            La fusión tiene conflictos y se canceló. No se cambió nada.
          </p>
          <p>Archivos en conflicto:</p>
          <ul className="list-disc pl-5">
            {result.files.map((file) => (
              <li key={file}>
                <code>{file}</code>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            GitLeviatán todavía no resuelve conflictos. Puedes hacer la fusión desde una terminal (
            <code>git merge {preview.source}</code>) y resolverlos allí.
          </p>
        </div>
      );
  }
}
