# Arquitectura

```text
React UI (repos, status, graph, diffs, settings)
  ↓ invoke() / eventos de progreso
Tauri Commands (API tipada, validación, cancelación)
  ↓
Rust Git Service (procesos, parseo, seguridad)
  ↓
Git CLI instalado en el equipo
  ↓
Repositorio local (.git + working tree)
  ↔ remotos Git existentes (solo por operaciones solicitadas)
```

## Frontend (`src/`)

- `app/`: raíz de la aplicación.
- `components/`: componentes compartidos y `ui/` (shadcn).
- `features/{repositories,status,graph,commits,branches,diffs,sync}`: un módulo por capacidad (vacíos tras el bootstrap).
- `stores/`, `lib/`, `types/`.

## Backend (`src-tauri/src/`)

- `commands/`: frontera pública de Tauri; cada comando que usa el frontend vive aquí (repositorios, estado, ramas, sincronización, preferencias, versión).
- `git/`: invocación y parseo de Git CLI (vacío tras el bootstrap).
- `storage/`: preferencias y repositorios recientes (vacío tras el bootstrap).

## Principios

Local-first, sin telemetría, argumentos estructurados a `Command` (nunca shell), capabilities mínimas.
