import { useCallback, useEffect, useRef, useState } from "react";

import logo from "@/assets/logo.png";
import { AppFooter } from "@/components/AppFooter";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GitMissingScreen } from "@/features/settings/GitMissingScreen";
import { PreferencesButton } from "@/features/settings/PreferencesButton";
import { PreferencesDialog } from "@/features/settings/PreferencesDialog";
import { CloseRepositoryButton } from "@/features/repositories/CloseRepositoryButton";
import { OpenRepositoryButton } from "@/features/repositories/OpenRepositoryButton";
import { CloneRepositoryButton } from "@/features/sync/CloneRepositoryButton";
import { Sidebar } from "@/app/Sidebar";
import { Workspace } from "@/app/Workspace";
import { useApplyTheme } from "@/lib/useApplyTheme";
import { useGlobalShortcuts } from "@/lib/useGlobalShortcuts";
import { useRepositoryStore } from "@/stores/repository";
import { useSettingsStore } from "@/stores/settings";

export function App() {
  const active = useRepositoryStore((s) => s.active);
  const error = useRepositoryStore((s) => s.error);
  const theme = useSettingsStore((s) => s.settings.theme);
  const git = useSettingsStore((s) => s.git);
  const settingsError = useSettingsStore((s) => s.loadError);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const reopenLastRepository = useSettingsStore((s) => s.settings.reopenLastRepository);
  const lastRepositoryPath = useSettingsStore((s) => s.settings.lastRepositoryPath);
  const reopenLast = useRepositoryStore((s) => s.reopenLast);
  const loadSettings = useSettingsStore((s) => s.load);
  const detectGit = useSettingsStore((s) => s.detectGit);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const openPreferences = useCallback(() => setPreferencesOpen(true), []);

  useApplyTheme(theme);
  useGlobalShortcuts({ onPreferences: openPreferences });

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Al iniciar se reabre el último proyecto (una sola vez, cuando se sabe que Git está disponible:
  // sin Git no se puede abrir nada y no hay que olvidar la ruta por ello).
  const reopenTried = useRef(false);
  useEffect(() => {
    if (reopenTried.current || !settingsLoaded || git === null) return;
    reopenTried.current = true;
    if (git.available && reopenLastRepository && lastRepositoryPath) {
      void reopenLast(lastRepositoryPath);
    }
  }, [settingsLoaded, git, reopenLastRepository, lastRepositoryPath, reopenLast]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-t-2 border-border border-t-accent-git px-4 py-2">
        <img src={logo} alt="" className="size-8" />
        <h1 className="text-lg font-semibold text-primary">GitLeviatán</h1>
        <span className="truncate text-sm text-muted-foreground" title={active?.path}>
          {active ? active.name : "Ningún repositorio abierto"}
        </span>
        <CloseRepositoryButton />
        <div className="ml-auto flex items-center gap-3">
          <CloneRepositoryButton />
          <OpenRepositoryButton />
          <ThemeToggle />
          <PreferencesButton onClick={openPreferences} />
        </div>
      </header>

      {(error || settingsError) && (
        <div className="border-b border-border bg-destructive/10 px-4 py-2">
          <ErrorNotice
            error={(error ?? settingsError)!}
            title={
              error
                ? (error.context ?? "No se pudo completar la operación")
                : "No se pudieron cargar las preferencias"
            }
          />
        </div>
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

      <AppFooter />
    </div>
  );
}
