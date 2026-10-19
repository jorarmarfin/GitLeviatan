import type { ReactNode } from "react";

import { RecentRepositories } from "@/features/repositories/RecentRepositories";

export function Sidebar({ children }: { children?: ReactNode }) {
  return (
    <aside
      aria-label="Barra lateral"
      data-area="sidebar"
      className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-border p-2"
    >
      <RecentRepositories />
      {children}
    </aside>
  );
}
