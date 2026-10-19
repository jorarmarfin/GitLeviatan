# GitLeviatán — Especificación de producto y arquitectura

**Versión:** 0.1.0 (borrador inicial)  
**Fecha:** 2026-10-19  
**Estado:** Propuesta para implementación  
**Licencia propuesta:** GPL-3.0-or-later (pendiente de confirmación)

## 1. Visión

GitLeviatán es un cliente gráfico de Git, libre, de código abierto y orientado a escritorio. Su objetivo es ofrecer una experiencia visual clara y potente para repositorios públicos y privados, sin suscripción, cuentas obligatorias, telemetría ni backend propio.

**Lema:** El poder de Git, bajo tu control.

### Principios

- Local-first: toda la gestión y el procesamiento de repositorios ocurren en el equipo.
- Sin backend de GitLeviatán ni dependencia de una cuenta del producto.
- Compatible con remotos externos mediante SSH o HTTPS; el tráfico a esos remotos es explícito y necesario para `fetch`, `pull`, `push` o `clone`.
- Privacidad por defecto: no enviar código ni métricas a terceros.
- Transparencia, seguridad y operaciones reversibles cuando Git lo permita.
- Linux (Ubuntu) primero; Windows y macOS después.

## 2. Público objetivo

Desarrolladores individuales y equipos que desean administrar repositorios Git privados o públicos con una interfaz gráfica, incluyendo usuarios que alternan entre terminal y herramientas visuales.

## 3. Alcance

### MVP (v0.1)

1. Abrir un repositorio local y recordar la lista de repositorios recientes.
2. Clonar mediante URL SSH/HTTPS y seleccionar carpeta destino.
3. Mostrar estado del working tree: archivos nuevos, modificados, eliminados y renombrados cuando Git lo detecte.
4. Stage y unstage por archivo; visualizar diff de archivos de texto.
5. Crear commits con mensaje y mostrar errores de validación/hook.
6. Mostrar historial de commits con autor, fecha, hash corto y mensaje.
7. Mostrar gráfico de commits y ramas, incluyendo merges, con navegación y selección.
8. Crear, cambiar y eliminar ramas locales con confirmaciones de seguridad.
9. Fetch, pull y push con indicadores de progreso y mensajes de error comprensibles.
10. Mostrar remotos y ramas de seguimiento.
11. Preferencias básicas: tema, ubicación de Git y repositorios recientes.
12. Funcionar con repositorios privados usando el mecanismo de autenticación Git existente en el equipo.

### Posterior al MVP (v0.2+)

- Resolución visual de conflictos de tres vías.
- Stage/unstage por fragmento (hunk) y edición avanzada de diffs.
- Stash, tags, cherry-pick, revert y reset.
- Rebase interactivo y reflog.
- Worktrees y submódulos.
- Terminal integrada y accesibilidad avanzada.
- Actualizaciones opcionales verificadas y localización a varios idiomas.
- Asistente de IA estrictamente opcional, con consentimiento explícito y sin transferencia de código por defecto.

### Fuera de alcance

- Hosting de repositorios, servidor Git propio o servicio de sincronización de GitLeviatán.
- Cuentas, facturación y suscripciones.
- Editor de código completo comparable a un IDE.
- Implementar un motor Git desde cero.

## 4. Stack tecnológico

| Capa | Elección | Motivo |
|---|---|---|
| Desktop | Tauri 2 | Integración nativa y empaquetado multiplataforma |
| UI | React + TypeScript + Vite | Ecosistema maduro y tipado |
| Componentes | Tailwind CSS + shadcn/ui | Consistencia y personalización |
| Estado | Zustand | Estado de interfaz acotado |
| Backend local | Rust + comandos Tauri | Acceso controlado al sistema y procesos |
| Git | Ejecutable Git instalado, vía `std::process::Command` | Fidelidad al comportamiento de Git |
| Diff | Visor basado en Monaco | Comparación legible de texto |
| Grafo | SVG personalizado (evaluar librería solo tras prototipo) | Control sobre diseño y rendimiento |
| Preferencias | Archivo de configuración local; SQLite solo si se justifica | Reducir complejidad inicial |
| Pruebas | Vitest, React Testing Library, pruebas Rust y E2E | Validación por capas |

Las versiones exactas de dependencias se fijarán al iniciar el repositorio y se actualizarán mediante PRs revisados.

## 5. Arquitectura

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

### Módulos frontend

- `repositories`: apertura, clonación, recientes.
- `status`: cambios y staging.
- `commits`: creación e historial.
- `graph`: representación DAG y navegación.
- `branches`: ramas y tracking.
- `diffs`: comparador de texto.
- `sync`: fetch/pull/push y progreso.
- `settings`: preferencias locales.

### Módulos Rust

- `commands/`: frontera pública de Tauri.
- `git/process.rs`: invocación segura, timeouts, cancelación y streaming.
- `git/parse.rs`: parseo estable de salidas Git.
- `git/repository.rs`: validación de rutas y estado.
- `git/operations.rs`: operaciones de alto nivel.
- `storage/`: preferencias y repositorios recientes.

## 6. Contratos y manejo de Git

- Nunca concatenar entrada del usuario en comandos de shell; pasar argumentos estructurados a `Command`.
- Ejecutar Git con `current_dir` validado y rutas de repositorio explícitas.
- Usar salidas diseñadas para parseo (`--porcelain=v1 -z` o equivalentes, `--format`, delimitadores NUL) y manejar nombres con espacios, Unicode y saltos de línea.
- Diferenciar cambios staged, unstaged y untracked; contemplar repositorios bare y detached HEAD.
- No asumir que el branch principal se llama `main`.
- Capturar stdout/stderr y códigos de salida; ofrecer errores útiles sin exponer secretos.
- Operaciones largas: ejecutar fuera del hilo UI, emitir progreso y permitir cancelación cuando sea segura.
- Para autenticación, respetar SSH agent y credential helpers del usuario; no persistir tokens en texto plano.
- No registrar URL con credenciales ni variables de entorno sensibles.
- Evitar operaciones destructivas sin confirmación y explicar efectos sobre cambios no confirmados.

### API Tauri propuesta (orientativa)

```ts
type RepositoryStatus = {
  branch: string | null;
  detachedHead: boolean;
  staged: ChangedFile[];
  unstaged: ChangedFile[];
  untracked: string[];
};

type CommitNode = {
  oid: string;
  parents: string[];
  author: string;
  authoredAt: string;
  subject: string;
  refs: string[];
};

// Comandos propuestos:
// open_repository(path)
// get_status(repositoryId)
// list_commits(repositoryId, cursor, limit)
// get_diff(repositoryId, path, scope)
// stage_files(repositoryId, paths)
// unstage_files(repositoryId, paths)
// create_commit(repositoryId, message)
// list_branches(repositoryId)
// checkout_branch(repositoryId, branch)
// fetch(repositoryId, remote)
// pull(repositoryId, remote, branch)
// push(repositoryId, remote, branch)
```

Los nombres y tipos finales deben generarse o compartirse entre Rust y TypeScript para evitar divergencias.

## 7. Experiencia de usuario

### Distribución principal

```text
┌──────────────────────────────────────────────────────────────┐
│ Barra superior: repo activo | branch | fetch | pull | push  │
├──────────────┬───────────────────────────┬───────────────────┤
│ Sidebar      │ Historial / grafo DAG     │ Detalle de commit │
│ Repos        │                           │ y diff            │
│ Branches     │ Commits + filtros         │                   │
│ Remotes      │                           │                   │
├──────────────┴───────────────────────────┴───────────────────┤
│ Panel de cambios: staged / unstaged / mensaje de commit     │
└──────────────────────────────────────────────────────────────┘
```

### Estados de UI obligatorios

- Carga inicial, repositorio vacío, operación en curso, sin conexión al remoto, conflicto Git, error recuperable.
- Notificaciones con contexto y posibilidad de consultar detalle técnico.
- Atajos de teclado documentados, navegación por teclado y contraste accesible.
- Virtualización o paginación para historiales extensos.

## 8. Seguridad y privacidad

1. Capabilities y permisos Tauri mínimos; no habilitar shell arbitraria desde el frontend.
2. Validar rutas, argumentos, selección de repositorios y acceso a archivos.
3. No enviar código fuente a servicios propios o analíticos.
4. Mantener credenciales en el gestor del sistema o mecanismos de Git, no en SQLite.
5. Confirmación para eliminación de ramas con cambios no fusionados y otras acciones de riesgo.
6. No renderizar HTML no confiable de mensajes de commit; tratarlo como texto.
7. Dependencias auditadas y CI con análisis de seguridad.
8. Aclarar en la documentación que Git hooks y configuración del repositorio pueden ejecutar comandos locales bajo el contexto del usuario.

## 9. Estructura del repositorio

```text
gitleviatan/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   │   ├── repositories/
│   │   ├── status/
│   │   ├── graph/
│   │   ├── commits/
│   │   ├── branches/
│   │   ├── diffs/
│   │   └── sync/
│   ├── stores/
│   ├── lib/
│   └── types/
├── src-tauri/
│   ├── src/
│   │   ├── commands/
│   │   ├── git/
│   │   ├── storage/
│   │   └── lib.rs
│   └── tauri.conf.json
├── tests/
├── docs/
│   ├── architecture.md
│   └── decisions/
├── .github/workflows/
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## 10. Plan de ejecución

| Fase | Entregables | Criterio de salida |
|---|---|---|
| 0. Bootstrap | Repo, licencia, CI, Tauri, React, tema | App arranca en Ubuntu |
| 1. Lectura | Abrir repo, status, historial | Refleja correctamente un repo de prueba |
| 2. Grafo | DAG, referencias, selección, paginación | Merges y ramas visibles sin bloqueos |
| 3. Escritura | Stage, unstage, commit, branches | Pruebas de integración pasan |
| 4. Remotos | Clone, fetch, pull, push | SSH/HTTPS funcionan con credenciales existentes |
| 5. Calidad | Errores, rendimiento, empaquetado Linux | Release candidata usable |
| 6. Expansión | Windows/macOS y funciones avanzadas | Builds y pruebas por plataforma |

No se fijan fechas hasta validar capacidad de desarrollo y prototipo del grafo.

## 11. Criterios de aceptación del MVP

- Abrir un repositorio privado existente sin registrarse en GitLeviatán.
- Ver el mismo estado de cambios que `git status` en escenarios de prueba.
- Realizar stage → commit → push y ver resultados consistentes en Git CLI.
- Mostrar correctamente un historial con ramas y merges.
- Mostrar mensajes claros cuando una operación falla por permisos, autenticación o conflictos.
- No almacenar credenciales en texto plano ni transmitir telemetría.
- Mantener la UI responsiva durante operaciones de red y lectura de historial.
- Distribuir un paquete Linux instalable, con documentación de dependencias.

## 12. Estrategia de pruebas

- Unitarias: parseo de salidas Git, grafo DAG, stores y validaciones.
- Integración: repositorios temporales con commits, merges, conflictos, ramas y nombres de archivo especiales.
- E2E: flujos de abrir, stage, commit y navegación.
- Rendimiento: medir carga y desplazamiento con repositorios de historiales grandes; fijar umbrales tras línea base.
- Seguridad: entradas maliciosas, rutas inesperadas, salida de procesos y secretos en logs.

## 13. Open source y gobernanza

- **Licencia recomendada inicialmente:** GPL-3.0-or-later, sujeta a confirmación antes de publicar. MIT es alternativa si se prioriza adopción permisiva.
- Publicar README en español e inglés, guía de contribución, política de seguridad y código de conducta.
- Usar issues etiquetados (`good first issue`, `bug`, `enhancement`) y pull requests revisadas.
- Versionado semántico y changelog desde la primera release pública.
- Verificar compatibilidad de licencias de dependencias y recursos visuales antes de distribuir.
- Nombre y branding propios: inspiración funcional, sin copiar recursos, logotipos o código propietario de GitKraken.

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Complejidad del grafo Git | Prototipo temprano con merges, múltiples padres y paginación |
| Salidas Git difíciles de parsear | Formatos estables, NUL y pruebas de casos extremos |
| Pérdida accidental de cambios | Confirmaciones y pruebas de operaciones destructivas |
| Problemas de autenticación | Delegar en Git/SSH y documentar configuración |
| Repositorios grandes | Operaciones asíncronas, carga incremental y virtualización |
| Diferencias entre SO | CI y pruebas específicas por plataforma |
| Alcance creciente | MVP cerrado y backlog de v0.2+ |

## 15. Decisiones pendientes

1. Confirmar licencia GPL-3.0-or-later o MIT.
2. Confirmar nombre definitivo, disponibilidad de marca y dominio.
3. Definir prototipo visual y sistema de diseño.
4. Elegir mecanismo de empaquetado inicial para Ubuntu (`.deb` y/o AppImage).
5. Establecer métricas de rendimiento y criterios cuantitativos tras el primer prototipo.

---

**Resumen:** GitLeviatán comienza como un cliente Git visual, open source, local-first y Linux-first, con Tauri 2, React/TypeScript y Rust. Su MVP prioriza repositorios, historial gráfico, cambios, commits, ramas y sincronización segura con remotos existentes.
