import { useEffect, useState } from "react";

import logo from "@/assets/logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GitMissingScreen } from "@/features/settings/GitMissingScreen";
import { PreferencesButton } from "@/features/settings/PreferencesButton";
import { PreferencesDialog } from "@/features/settings/PreferencesDialog";
import { OpenRepositoryButton } from "@/features/repositories/OpenRepositoryButton";
import { CloneRepositoryButton } from "@/features/sync/CloneRepositoryButton";
import { ping } from "@/lib/ping";
import { Sidebar } from "@/app/Sidebar";
import { Workspace } from "@/app/Workspace";
import { useApplyTheme } from "@/lib/useApplyTheme";
import { useRepositoryStore } from "@/stores/repository";
import { useSettingsStore } from "@/stores/settings";

export function App() {
  const [pong, setPong] = useState<string>("…");
  const active = useRepositoryStore((s) => s.active);
  const error = useRepositoryStore((s) => s.error);
  const theme = useSettingsStore((s) => s.settings.theme);
  const git = useSettingsStore((s) => s.git);
  const loadSettings = useSettingsStore((s) => s.load);
  const detectGit = useSettingsStore((s) => s.detectGit);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useApplyTheme(theme);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

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
          <CloneRepositoryButton />
          <OpenRepositoryButton />
          <ThemeToggle />
          <PreferencesButton onClick={() => setPreferencesOpen(true)} />
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
        {git && !git.available ? (
          <GitMissingScreen
            message={git.message}
            onRetry={() => void detectGit()}
            onOpenPreferences={() => setPreferencesOpen(true)}
          />
        ) : active ? (
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

      {preferencesOpen && <PreferencesDialog onClose={() => setPreferencesOpen(false)} />}

      <footer className="border-t border-border px-4 py-1 text-xs text-muted-foreground">
        <span data-testid="ping">ping: {pong}</span>
      </footer>
    </div>
  );
}
