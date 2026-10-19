import { useEffect } from "react";
import { X } from "lucide-react";

import { useRepositoryStore } from "@/stores/repository";

export function RecentRepositories() {
  const recents = useRepositoryStore((s) => s.recents);
  const active = useRepositoryStore((s) => s.active);
  const loadRecents = useRepositoryStore((s) => s.loadRecents);
  const openRepository = useRepositoryStore((s) => s.openRepository);
  const removeRecent = useRepositoryStore((s) => s.removeRecent);

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
          <li key={repo.path} className="group flex items-center gap-1">
            <button
              type="button"
              title={repo.path}
              aria-current={active?.path === repo.path ? "true" : undefined}
              onClick={() => void openRepository(repo.path)}
              className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent aria-[current=true]:bg-selected aria-[current=true]:font-medium"
            >
              {repo.name}
            </button>
            {/* Solo quita la entrada de la lista: ni el repositorio ni el disco se tocan.
                Visible al pasar el ratón y al enfocar con teclado (no se oculta con display). */}
            <button
              type="button"
              aria-label={`Quitar ${repo.name} de recientes`}
              title="Quitar de recientes (no borra nada del disco)"
              onClick={() => void removeRecent(repo.path)}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
