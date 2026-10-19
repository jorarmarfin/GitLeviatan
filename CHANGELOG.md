# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
[SemVer](https://semver.org/lang/es/). El workflow de release usa la sección `## [X.Y.Z]` del tag
como notas de la versión.

## [Sin publicar]

### Añadido

- **Quitar de recientes:** una **×** junto a cada proyecto de la lista, que solo borra la entrada (no toca el
  repositorio ni el disco) y es operable con teclado. Pide confirmación en un modal de la app (con el foco en
  **Cancelar**), no en un diálogo nativo del navegador (SPEC 11).
- Una prueba impide usar `confirm`, `alert` o `prompt` nativos en el código de la app.
- **Cerrar repositorio:** botón en la cabecera que vuelve a la pantalla inicial. Se deshabilita mientras hay un
  fetch, pull o push en curso, y lo explica (SPEC 11).

- **Versión de la app en el pie** (`GitLeviatán v0.2.0`), tomada de `tauri.conf.json`. Una prueba exige que
  `package.json`, `Cargo.toml` y `tauri.conf.json` tengan la misma versión (SPEC 11).

### Cambiado

- Los errores de abrir un repositorio y de la lista de recientes indican qué operación falló.
- Se elimina el `ping: pong` del pie y el comando `ping`, restos de la SPEC 01.

## [0.2.0] - 2026-10-19

Preparar y quitar todo con un clic, y un retoque visual con la paleta del logo. Los instaladores de Windows y
macOS siguen **sin firmar** y su verificación manual en equipos reales sigue pendiente (ver `docs/platforms.md`).

### Añadido

- `scripts/build.sh --bundle` genera los paquetes del sistema actual (Linux: `.deb` y AppImage; macOS: `.dmg`;
  Windows desde Git Bash: NSIS).
- `scripts/build-windows.ps1` e `installer/windows/gitleviatan.iss`: instalador de Windows con Inno Setup
  para uso local (sin ejecutar todavía en Windows). Ver `docs/platforms.md`.
- **Preparar todo** (`git add -A`) y **Quitar todo** (`git reset`) en el panel de cambios, también en repositorios
  sin commits y con miles de archivos (SPEC 10).
- Retoque visual con la paleta del logo: azul primario, acento naranja de Git, fondo oscuro azul marino, color
  por tipo de cambio (siempre junto al texto), cabeceras de sección con contador y fila seleccionada con velo
  azul. Todo con tokens de `index.css` y validado con la prueba de contraste AA (SPEC 10).
- Pruebas que impiden colores sueltos fuera de los tokens (`src/no-raw-colors.test.ts`).

### Cambiado

- Los errores del panel de cambios dicen qué operación falló («No se pudo preparar todo») en vez de siempre
  «No se pudo crear el commit».
- `color-scheme` claro/oscuro: las barras de desplazamiento nativas siguen el tema.

## [0.1.0] - 2026-10-19

Primera versión del MVP: Ubuntu (`.deb` y AppImage), Windows (instalador NSIS) y macOS (`.dmg` universal).
Los instaladores de Windows y macOS **no están firmados**; Windows y macOS se verifican en CI pero
la verificación manual en equipos reales sigue pendiente (ver `docs/platforms.md`).

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
- Soporte para Windows y macOS (SPEC 09): matriz de CI con las tres plataformas, instalador NSIS (`.exe`)
  y `.dmg` universal en el workflow de release, sin firmar. Ver `docs/platforms.md`.
- Detección de Git por plataforma: Preferencias → `PATH` → sitios habituales (Git for Windows, Homebrew).
- Windows: Git sin ventanas de consola, cancelación de todo el árbol de procesos y rutas largas.
- `.gitattributes` con finales de línea LF en todas las plataformas.

### Corregido

- Con `core.autocrlf=true` el visor de diff ya no marca todas las líneas como cambiadas.
- En Windows se rechazan las rutas con raíz (`/etc/passwd`, `\x`) que antes podían salir del repositorio.

### Cambiado

- El tema se guarda en `settings.json`; el valor antiguo de `localStorage` se migra una sola vez.
- Ajustados `--destructive` (tema claro) y `--destructive-foreground` (tema oscuro) para cumplir
  contraste WCAG AA.

### Seguridad

- Las URLs se sanean antes de mostrarse o registrarse: nunca aparece `usuario:token@`.
- Las operaciones de red solo admiten los protocolos `file`, `git`, `http(s)` y `ssh`.
