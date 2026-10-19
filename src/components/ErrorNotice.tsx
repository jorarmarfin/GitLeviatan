import type { OperationError } from "@/types/git";

type Props = {
  error: OperationError;
  /** Contexto de lo que se intentaba («No se pudo cargar el historial»). */
  title?: string;
};

/** Notificación de error: contexto, mensaje legible y detalle técnico plegado. */
export function ErrorNotice({ error, title }: Props) {
  return (
    <div role="alert" className="text-sm text-destructive">
      {title && <p className="font-semibold">{title}</p>}
      <p>{error.message}</p>
      {error.detail && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs">Ver detalle técnico</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
            {error.detail}
          </pre>
        </details>
      )}
    </div>
  );
}
