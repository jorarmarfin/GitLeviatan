import { useEffect } from "react";

import { useRepositoryStore } from "@/stores/repository";

export function RecentRepositories() {
  const recents = useRepositoryStore((s) => s.recents);
  const active = useRepositoryStore((s) => s.active);
  const loadRecents = useRepositoryStore((s) => s.loadRecents);
  const openRepository = useRepositoryStore((s) => s.openRepository);

  useEffect(() => {
    void loadRecents();
  }, [loadRecents]);

  return (
    <nav aria-label="Repositorios recientes" className="flex flex-col gap-1">
      <h2 className="px-2 text-xs font-semibold uppercase text-muted-foreground">Recientes</h2>
      {recents.length === 0 && (
        <p className="px-2 text-sm text-muted-foreground">Aún no has abierto repositorios.</p>
      )}
      <ul>
        {recents.map((repo) => (
          <li key={repo.path}>
            <button
              type="button"
              title={repo.path}
              aria-current={active?.path === repo.path ? "true" : undefined}
              onClick={() => void openRepository(repo.path)}
              className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent aria-[current=true]:bg-selected aria-[current=true]:font-medium"
            >
              {repo.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
