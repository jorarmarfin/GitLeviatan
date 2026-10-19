import { Button } from "@/components/ui/button";

type Props = { message: string | null; onRetry: () => void; onOpenPreferences: () => void };

/** Pantalla que sustituye al espacio de trabajo cuando no se puede ejecutar Git. */
export function GitMissingScreen({ message, onRetry, onOpenPreferences }: Props) {
  return (
    <main role="alert" className="col-span-2 mx-auto flex max-w-xl flex-col gap-4 p-8">
      <h2 className="text-xl font-semibold">No se encontró Git</h2>
      <p className="text-sm text-muted-foreground">
        GitLeviatán usa el ejecutable de Git de tu sistema. {message}
      </p>
      <ul className="list-disc pl-5 text-sm">
        <li>
          <strong>Linux:</strong> instálalo con tu gestor de paquetes, p. ej.{" "}
          <code>sudo apt install git</code> o <code>sudo dnf install git</code>.
        </li>
        <li>
          <strong>macOS:</strong> <code>xcode-select --install</code> o{" "}
          <code>brew install git</code>.
        </li>
        <li>
          <strong>Windows:</strong> descárgalo desde git-scm.com/download/win.
        </li>
      </ul>
      <p className="text-sm text-muted-foreground">
        Si ya lo tienes instalado fuera del PATH, indica su ubicación en Preferencias.
      </p>
      <div className="flex gap-2">
        <Button onClick={onRetry}>Reintentar</Button>
        <Button variant="outline" onClick={onOpenPreferences}>
          Abrir preferencias
        </Button>
      </div>
    </main>
  );
}
