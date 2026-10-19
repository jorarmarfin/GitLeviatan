# SPEC 06 — Remotos, clone, fetch, pull y push

> **Estado:** Borrador
> **Depende de:** SPEC 02, SPEC 05
> **Fecha:** 2026-10-19
> **Objetivo:** Mostrar los remotos y permitir clonar, hacer fetch, pull y push con progreso, cancelación y mensajes de error comprensibles, delegando la autenticación en SSH y en los credential helpers de Git.

## Por qué existe esta spec

Es la Fase 4. Es la única parte que toca la red, por lo que fija las reglas de privacidad y de manejo de credenciales del producto.

## Alcance

**Dentro:**

- Lista de remotos con su URL (sin credenciales incrustadas).
- `clone_repository(url, destDir)` por SSH o HTTPS, con selector de carpeta destino y apertura automática al terminar.
- `fetch`, `pull` y `push` desde la barra superior, con progreso y botón Cancelar.
- Eventos de progreso desde Rust leyendo `--progress` de Git.
- Clasificación de errores: autenticación, red, rechazo no fast-forward, conflicto, permisos, remoto inexistente.
- Estado "sin conexión al remoto".
- `GIT_TERMINAL_PROMPT=0` para que Git nunca se quede esperando una entrada.

**Fuera de alcance (para specs futuras):**

- Push forzado y eliminación de ramas remotas.
- Añadir, quitar o editar remotos.
- Asistente de login o gestor de credenciales propio.
- Estrategias de pull distintas de fast-forward (merge y rebase).
- Submódulos, LFS y clones superficiales o parciales.
- Resolución de conflictos.

## Modelo de datos

```ts
type RemoteInfo = { name: string; fetchUrl: string; pushUrl: string }; // URLs sin credenciales

type SyncProgress = {
  operationId: string;
  phase: "counting" | "receiving" | "resolving" | "sending" | "done";
  percent: number | null;
};

type GitErrorKind =
  | "auth" | "network" | "nonFastForward" | "conflict"
  | "permission" | "remoteNotFound" | "cancelled" | "unknown";

type SyncError = { kind: GitErrorKind; message: string; detail: string };
```

Convenciones:

- Comandos: `list_remotes`, `clone_repository`, `fetch(repositoryId, remote)`, `pull(repositoryId, remote, branch)`, `push(repositoryId, remote, branch)`, `cancel_operation(operationId)`.
- Evento Tauri: `sync-progress` con `SyncProgress`.
- Antes de mostrar o registrar una URL se eliminan `usuario:token@`.
- `pull` usa `--ff-only`; si no es posible, informa y no modifica nada.
- `push` usa `-u` solo cuando la rama no tiene upstream.
- Las operaciones largas corren fuera del hilo de la UI; cancelar mata el proceso hijo.

## Plan de implementación

1. Ampliar `git/process.rs` con ejecución en streaming de stderr y cancelación por `operationId`. Prueba con un comando de espera.
2. Implementar `list_remotes` con sanitización de URLs. Pruebas con URLs con credenciales.
3. Implementar la clasificación de errores a partir del stderr de Git (`LC_ALL=C`). Pruebas con salidas capturadas.
4. Implementar `fetch` con progreso y cancelación. Prueba contra un remoto local (`file://`) en un repositorio temporal.
5. Implementar `pull --ff-only` con prueba de avance y de divergencia.
6. Implementar `push` con `-u` condicional. Prueba contra un remoto bare local y caso no fast-forward.
7. Crear `features/sync`: botones de la barra superior, barra de progreso, Cancelar y notificaciones con detalle técnico.
8. Implementar `clone_repository` con progreso, selector de carpeta destino (capability `dialog`) y apertura automática.
9. Mostrar los remotos y las ramas de seguimiento en la sidebar.
10. Verificación manual con un remoto real por SSH y otro por HTTPS con credential helper.

## Criterios de aceptación

- [ ] Fetch, pull y push funcionan contra un remoto `file://` en las pruebas automáticas.
- [ ] Stage → commit → push (SPEC 04 + SPEC 06) deja el remoto con el mismo historial que vería la CLI.
- [ ] Clonar por SSH y por HTTPS funciona usando el SSH agent o el credential helper ya configurados.
- [ ] Una URL con `usuario:token@` nunca aparece en la UI, en eventos ni en logs.
- [ ] Un push rechazado por no fast-forward muestra un mensaje que lo explica.
- [ ] Un fallo de autenticación se muestra como tal, sin dejar la app esperando una contraseña.
- [ ] Cancelar un fetch largo detiene el proceso Git y deja la UI utilizable.
- [ ] Sin red, la operación termina con el estado "sin conexión" y no bloquea la UI.
- [ ] No se guarda ninguna credencial en archivos de la app.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** delegar la autenticación en Git/SSH (decisión del documento de producto).
- **No:** guardar tokens en la app. Cumple "no persistir tokens en texto plano" evitando persistirlos.
- **Sí:** `pull --ff-only`. Evita merges o rebases inesperados sin conflicto resuelto en la UI. Propuesta por defecto; confirmar al aprobar.
- **No:** push forzado. Es destructivo; entra con confirmaciones en una spec propia.
- **Sí:** `GIT_TERMINAL_PROMPT=0`. Una app gráfica no puede contestar prompts de terminal.
- **Sí:** probar contra remotos `file://` y bare locales. Es determinista y no requiere red en CI.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Credential helpers que necesitan interacción gráfica | Documentar la configuración; mostrar el error de autenticación con ayuda. |
| Mensajes de Git cambian entre versiones e idiomas | `LC_ALL=C` y pruebas con salidas capturadas; caer en `unknown` con el detalle crudo. |
| SSH pide confirmar la huella del host (`known_hosts`) | Con `GIT_TERMINAL_PROMPT=0` falla; mostrar instrucciones para aceptar la huella en terminal. |
| Fuga de secretos en logs | Sanitizar URLs y no registrar variables de entorno. |
| Clones muy grandes | Progreso real y cancelación; sin clones parciales en esta spec. |

## Lo que **no** está en esta spec

- Push forzado, gestión de remotos, estrategias de pull alternativas.
- Gestor de credenciales propio.
- Submódulos y LFS.

Cada uno entra, si llega, en su propia spec.
