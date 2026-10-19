# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
[SemVer](https://semver.org/lang/es/). El workflow de release usa la sección `## [X.Y.Z]` del tag
como notas de la versión.

## [Sin publicar]

### Añadido

- Soporte para Windows y macOS (SPEC 09): matriz de CI con las tres plataformas, instalador NSIS (`.exe`)
  y `.dmg` universal en el workflow de release, sin firmar. Ver `docs/platforms.md`.
- Detección de Git por plataforma: Preferencias → `PATH` → sitios habituales (Git for Windows, Homebrew).
- Windows: Git sin ventanas de consola, cancelación de todo el árbol de procesos y rutas largas.
- `.gitattributes` con finales de línea LF en todas las plataformas.

### Corregido

- Con `core.autocrlf=true` el visor de diff ya no marca todas las líneas como cambiadas.

## [0.1.0] - Pendiente de publicar

Primera release candidata del MVP para Ubuntu.

### Añadido

- Abrir repositorios y lista de recientes (SPEC 02).
- Historial con grafo de commits, virtualizado, y detalle de cada commit (SPEC 03).
- Cambios del working tree, staging, diff y creación de commits, con la salida de los hooks (SPEC 04).
- Ramas locales y de seguimiento: crear, cambiar y eliminar con confirmaciones de seguridad (SPEC 05).
- Remotos, clone, fetch, pull (solo fast-forward) y push con progreso, cancelación y errores
  clasificados; la autenticación se delega en SSH y en los credential helpers de Git (SPEC 06).
- Preferencias en `settings.json`: tema, ruta del ejecutable de Git y repositorios recientes;
  detección de Git al arrancar (SPEC 07).
- Tipo de error único `AppError` con detalle técnico visible en todas las operaciones (SPEC 08).
- Umbrales de rendimiento (`tests/perf/thresholds.json`) comprobados en CI (SPEC 08).
- Navegación por teclado: foco atrapado en diálogos, `Alt+1/2/3` entre vistas, `Ctrl+,` para
  Preferencias y `Ctrl+Enter` para commitear. Ver `docs/shortcuts.md` (SPEC 08).
- Auditoría de dependencias en CI (`cargo audit`, `cargo deny`, `pnpm audit`, licencias) (SPEC 08).
- Prueba E2E del flujo abrir → stage → commit → historial con `tauri-driver` (SPEC 08).
- Paquetes `.deb` y AppImage (SPEC 08).

### Cambiado

- El tema se guarda en `settings.json`; el valor antiguo de `localStorage` se migra una sola vez.
- Ajustados `--destructive` (tema claro) y `--destructive-foreground` (tema oscuro) para cumplir
  contraste WCAG AA.

### Seguridad

- Las URLs se sanean antes de mostrarse o registrarse: nunca aparece `usuario:token@`.
- Las operaciones de red solo admiten los protocolos `file`, `git`, `http(s)` y `ssh`.
