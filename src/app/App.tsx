import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { CommitList } from "@/features/commits/CommitList";
import { OpenRepositoryButton } from "@/features/repositories/OpenRepositoryButton";
import { RecentRepositories } from "@/features/repositories/RecentRepositories";
import { StatusPanel } from "@/features/status/StatusPanel";
import { ping } from "@/lib/ping";
import { useRepositoryStore } from "@/stores/repository";

export function App() {
  const [pong, setPong] = useState<string>("…");
  const active = useRepositoryStore((s) => s.active);
  const error = useRepositoryStore((s) => s.error);

  useEffect(() => {
    ping()
      .then(setPong)
      .catch((e: unknown) => setPong(`error: ${String(e)}`));
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-border px-4 py-2">
        <h1 className="text-lg font-semibold">GitLeviatán</h1>
        <span className="truncate text-sm text-muted-foreground" title={active?.path}>
          {active ? active.name : "Ningún repositorio abierto"}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <OpenRepositoryButton />
          <ThemeToggle />
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[14rem_1fr_22rem]">
        <aside className="overflow-y-auto border-r border-border p-2">
          <RecentRepositories />
        </aside>
        <main className="overflow-y-auto">
          {active ? (
            <CommitList key={active.id} repository={active} />
          ) : (
            <p className="p-6 text-muted-foreground">
              Abre un repositorio para ver su historial. <br />
              El poder de Git, bajo tu control.
            </p>
          )}
        </main>
        <aside className="overflow-y-auto border-l border-border" aria-label="Cambios">
          {active && <StatusPanel key={active.id} repository={active} />}
        </aside>
      </div>

      <footer className="border-t border-border px-4 py-1 text-xs text-muted-foreground">
        <span data-testid="ping">ping: {pong}</span>
      </footer>
    </div>
  );
}
