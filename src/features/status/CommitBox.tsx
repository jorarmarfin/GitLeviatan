import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { OperationError } from "./useChanges";

type Props = {
  stagedCount: number;
  busy: boolean;
  error: OperationError | null;
  onCommit: (message: string) => Promise<boolean>;
};

export function CommitBox({ stagedCount, busy, error, onCommit }: Props) {
  const [message, setMessage] = useState("");
  const canCommit = !busy && stagedCount > 0 && message.trim() !== "";

  async function submit() {
    // Si falla, el mensaje se conserva para poder corregir y reintentar.
    if (await onCommit(message)) setMessage("");
  }

  return (
    <form
      className="flex flex-col gap-2 border-t border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        aria-label="Mensaje de commit"
        placeholder="Mensaje del commit"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
      />
      <Button type="submit" size="sm" disabled={!canCommit}>
        {busy ? "Trabajando…" : `Commit (${stagedCount})`}
      </Button>
      {error && (
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
      )}
    </form>
  );
}
