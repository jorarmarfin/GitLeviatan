import type { OperationError } from "@/types/git";

/** Error de una operación con el detalle técnico (stderr de Git) plegado. */
export function ErrorNotice({ error }: { error: OperationError }) {
  return (
    <div role="alert" className="text-sm text-destructive">
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
