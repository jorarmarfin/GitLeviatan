import type { SyncPhase, SyncProgress } from "@/types/git";

const PHASE_LABEL: Record<SyncPhase, string> = {
  counting: "Preparando objetos",
  receiving: "Recibiendo objetos",
  resolving: "Resolviendo deltas",
  sending: "Enviando objetos",
  done: "Terminando",
};

/** Barra de progreso; indeterminada mientras Git no informa un porcentaje. */
export function SyncProgressBar({ progress }: { progress: SyncProgress | null }) {
  const percent = progress?.percent ?? null;
  const label = progress ? PHASE_LABEL[progress.phase] : "Conectando…";
  return (
    <div className="flex min-w-40 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">
        {label}
        {percent !== null && ` ${percent}%`}
      </span>
      <div
        role="progressbar"
        aria-label="Progreso de la operación"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-1.5 overflow-hidden rounded bg-muted"
      >
        <div
          className={`h-full bg-primary ${percent === null ? "w-1/3 animate-pulse" : ""}`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
