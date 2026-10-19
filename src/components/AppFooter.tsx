import { useEffect, useState } from "react";

import { api } from "@/lib/api";

/** Pie de la ventana con la versión de la app (la de `tauri.conf.json`). */
export function AppFooter() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api
      .getAppVersion()
      .then((value) => current && setVersion(value))
      // Sin versión el pie sigue funcionando: solo muestra el nombre.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  return (
    <footer className="border-t border-border px-4 py-1 text-xs text-muted-foreground">
      <span data-testid="app-version">GitLeviatán{version ? ` v${version}` : ""}</span>
    </footer>
  );
}
