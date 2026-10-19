import { useEffect, useState } from "react";

import logo from "@/assets/logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OpenRepositoryButton } from "@/features/repositories/OpenRepositoryButton";
import { ping } from "@/lib/ping";
import { Sidebar } from "@/app/Sidebar";
import { Workspace } from "@/app/Workspace";
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
        <img src={logo} alt="" className="size-8" />
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

      <div className="grid min-h-0 flex-1 grid-cols-[14rem_1fr]">
        {active ? (
          <Workspace key={active.id} repository={active} />
        ) : (
          <>
            <Sidebar />
            <main className="p-6 text-muted-foreground">
              Abre un repositorio para ver su historial. <br />
              El poder de Git, bajo tu control.
            </main>
          </>
        )}
      </div>

      <footer className="border-t border-border px-4 py-1 text-xs text-muted-foreground">
        <span data-testid="ping">ping: {pong}</span>
      </footer>
    </div>
  );
}
