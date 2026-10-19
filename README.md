<p align="center"><img src="src/assets/logo.png" alt="Logo de GitLeviatán" width="160" /></p>

# GitLeviatán

**ES:** Cliente gráfico de Git, libre y local-first. _El poder de Git, bajo tu control._
**EN:** Free, local-first graphical Git client. _The power of Git, under your control._

Licencia / License: [GPL-3.0-or-later](LICENSE)

> Estado / Status: v0.2.0: Ubuntu verificado; Windows y macOS compilan y pasan los tests en CI, verificación manual pendiente. / v0.2.0: Ubuntu verified; Windows and macOS build and pass tests in CI, manual verification pending.
> Ver el [CHANGELOG](CHANGELOG.md). / See the [CHANGELOG](CHANGELOG.md).

---

## Español

### Instalación (Ubuntu)

Descarga el paquete de la [última release](../../releases/latest):

```bash
sudo apt install ./GitLeviatan_*_amd64.deb      # .deb: instala también Git y las librerías necesarias
# o, sin instalar:
chmod +x GitLeviatan_*.AppImage && ./GitLeviatan_*.AppImage
```

**Dependencias del paquete Linux.** Versión mínima probada: Ubuntu 22.04 (glibc 2.35).

| Paquete                             | Para qué                              | Lo instala el `.deb` | Con el AppImage |
| ----------------------------------- | ------------------------------------- | :------------------: | :-------------: |
| `git`                               | Todas las operaciones del repositorio |          Sí          |  Instálalo tú   |
| `libwebkit2gtk-4.1-0`, `libgtk-3-0` | Ventana y renderizado (WebKitGTK)     |          Sí          |  Instálalos tú  |
| `ssh-agent` / credential helper     | Autenticación con remotos (opcional)  |          No          |       No        |

Si Git no está instalado, la app lo indica al arrancar. Si el AppImage no abre, comprueba
`sudo apt install libwebkit2gtk-4.1-0 libfuse2`.

### Instalación en Windows y macOS

| Plataforma | Paquete                  | Requisitos                                                                                       |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Windows    | Instalador `.exe` (NSIS) | Windows 10+ y [Git for Windows](https://git-scm.com/download/win). WebView2 se instala si falta. |
| macOS      | `.dmg` universal         | macOS 10.15+ y Git (`brew install git` o `xcode-select --install`).                              |

La app busca Git en las Preferencias, luego en el `PATH` y luego en sitios habituales (Git for Windows, Homebrew).
La autenticación usa lo que ya tengas configurado: `ssh-agent`/OpenSSH y Git Credential Manager en Windows;
`ssh-agent` y Keychain (`osxkeychain`) en macOS.

> ⚠️ **Los instaladores de Windows y macOS no están firmados.** Es una limitación conocida: firmar y notarizar
> requiere certificados de pago.
>
> - **Windows (SmartScreen):** «Windows protegió su PC» → _Más información_ → _Ejecutar de todas formas_.
> - **macOS (Gatekeeper):** clic derecho sobre la app → _Abrir_. Si macOS dice que está dañada:
>   `xattr -dr com.apple.quarantine /Applications/GitLeviatan.app`.
>
> Comprueba la integridad con `SHA256SUMS.txt` de la release. Más detalles y limitaciones en
> [docs/platforms.md](docs/platforms.md).

### Compilar en local

Cada sistema compila los paquetes de **su propia plataforma** (el `.exe` se genera en Windows, el `.dmg` en macOS
y el `.deb`/AppImage en Linux). La primera compilación tarda varios minutos porque descarga y compila Tauri.

**1. Requisitos comunes:** Git, Node.js 24+, [pnpm](https://pnpm.io) 10+ y Rust estable
(vía [rustup](https://rustup.rs)).

**2. Requisitos de cada sistema:**

| Sistema            | Qué instalar                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Linux** (Ubuntu) | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf`                                                                                   |
| **Windows**        | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) con la carga «Desarrollo para el escritorio con C++», Rust con el toolchain `msvc` y Git for Windows. WebView2 ya viene con Windows 10/11. |
| **macOS**          | Command Line Tools (`xcode-select --install`). Para el `.dmg` universal: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.                                                                                             |

**3. Obtener el código e instalar dependencias:**

```bash
git clone https://github.com/jorarmarfin/GitLeviatan.git
cd GitLeviatan
pnpm install
```

**4. Probar la app en desarrollo** (ventana de escritorio con recarga en caliente):

```bash
pnpm tauri dev        # o scripts/dev.sh
```

> `pnpm dev` solo levanta la parte web (Vite) y **no** compila el backend de Rust: para la app de escritorio usa
> siempre `pnpm tauri dev`.

**5. Comprobar que todo está bien** (lint, formato y tests de frontend y Rust):

```bash
scripts/check.sh      # o, por separado:
pnpm lint && pnpm format:check && pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

**6. Compilar:**

| Qué quieres                          | Comando                                            | Resultado                                                  |
| ------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| Solo el ejecutable, sin instalador   | `pnpm tauri build --no-bundle`                     | `src-tauri/target/release/gitleviatan` (`.exe` en Windows) |
| Paquetes del sistema actual          | `scripts/build.sh --bundle` (o `pnpm tauri build`) | Ver la tabla siguiente                                     |
| Instalador de Windows con Inno Setup | `scripts\build-windows.ps1` (PowerShell)           | `dist-installer\GitLeviatan_<versión>_x64-inno-setup.exe`  |

`scripts/build.sh` también acepta `--check` (ejecuta antes los tests) y, en Windows desde Git Bash, `--inno`.

| Sistema | Paquetes generados y dónde quedan (`src-tauri/target/release/bundle/…`)                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux   | `deb/GitLeviatan_<versión>_amd64.deb` y `appimage/GitLeviatan_<versión>_amd64.AppImage`                                                                                                                                         |
| Windows | `nsis/GitLeviatan_<versión>_x64-setup.exe` (instalador NSIS)                                                                                                                                                                    |
| macOS   | `dmg/GitLeviatan_<versión>_<arquitectura>.dmg`. Universal (Intel + Apple Silicon): `pnpm tauri build --target universal-apple-darwin --bundles dmg`, que queda en `src-tauri/target/universal-apple-darwin/release/bundle/dmg/` |

Para instalar el `.deb` generado: `sudo apt install ./src-tauri/target/release/bundle/deb/GitLeviatan_*_amd64.deb`.
El instalador de Inno Setup necesita [Inno Setup](https://jrsoftware.org/isdl.php) 6.3 o superior; más detalles en
[docs/platforms.md](docs/platforms.md). Las pruebas E2E se explican en [docs/e2e.md](docs/e2e.md) (`pnpm e2e`).

**Problemas frecuentes**

- **`rustc` se cae con `SIGSEGV` al compilar `tauri-build`** (visto con Rust 1.99.1): fija la versión anterior
  dentro del proyecto con `rustup toolchain install 1.99.0 && rustup override set 1.99.0`. Se quita con
  `rustup override unset`.
- **En Windows, `link.exe` no se encuentra:** faltan las Visual Studio Build Tools con la carga de C++.
- **El AppImage no se genera por falta de FUSE:** `APPIMAGE_EXTRACT_AND_RUN=1 pnpm tauri build` (el script
  `scripts/build.sh` ya lo hace).
- **Al abrir el propio repositorio de GitLeviatán con `pnpm tauri dev`, cambiar de rama recarga la app:** Git
  reescribe los archivos fuente y Vite recarga la interfaz. Con otro repositorio o con la app instalada no ocurre.

### Privacidad

Local-first: sin cuentas, sin telemetría y sin backend propio. Git hooks y la configuración
de un repositorio pueden ejecutar comandos locales con tus permisos de usuario.

## English

### Installation (Ubuntu)

Download the package from the [latest release](../../releases/latest):

```bash
sudo apt install ./GitLeviatan_*_amd64.deb      # .deb: also installs Git and the required libraries
# or, without installing:
chmod +x GitLeviatan_*.AppImage && ./GitLeviatan_*.AppImage
```

**Linux package dependencies.** Minimum tested version: Ubuntu 22.04 (glibc 2.35). The `.deb` pulls in `git`,
`libwebkit2gtk-4.1-0` and `libgtk-3-0`; with the AppImage you install them yourself (plus `libfuse2` if it does
not start). An SSH agent or Git credential helper is only needed for authenticated remotes.

### Installation on Windows and macOS

| Platform | Package                 | Requirements                                                                                           |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Windows  | `.exe` installer (NSIS) | Windows 10+ and [Git for Windows](https://git-scm.com/download/win). WebView2 is installed if missing. |
| macOS    | universal `.dmg`        | macOS 10.15+ and Git (`brew install git` or `xcode-select --install`).                                 |

The app looks for Git in Preferences, then in `PATH`, then in common locations (Git for Windows, Homebrew).
Authentication uses what you already have configured: `ssh-agent`/OpenSSH and Git Credential Manager on Windows;
`ssh-agent` and Keychain (`osxkeychain`) on macOS.

> ⚠️ **The Windows and macOS installers are not signed.** Known limitation: signing and notarizing needs paid
> certificates.
>
> - **Windows (SmartScreen):** "Windows protected your PC" → _More info_ → _Run anyway_.
> - **macOS (Gatekeeper):** right-click the app → _Open_. If macOS says it is damaged:
>   `xattr -dr com.apple.quarantine /Applications/GitLeviatan.app`.
>
> Verify integrity with the release's `SHA256SUMS.txt`. More details and limitations in
> [docs/platforms.md](docs/platforms.md).

### Building locally

Each system builds the packages of **its own platform** (the `.exe` on Windows, the `.dmg` on macOS and the
`.deb`/AppImage on Linux). The first build takes several minutes because it downloads and compiles Tauri.

**1. Common requirements:** Git, Node.js 24+, [pnpm](https://pnpm.io) 10+ and stable Rust
(via [rustup](https://rustup.rs)).

**2. Per-system requirements:**

| System             | What to install                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Linux** (Ubuntu) | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf`                                                                                 |
| **Windows**        | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, Rust with the `msvc` toolchain and Git for Windows. WebView2 ships with Windows 10/11. |
| **macOS**          | Command Line Tools (`xcode-select --install`). For the universal `.dmg`: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.                                                                                           |

**3. Get the code and install dependencies:**

```bash
git clone https://github.com/jorarmarfin/GitLeviatan.git
cd GitLeviatan
pnpm install
```

**4. Run the app in development** (desktop window with hot reload):

```bash
pnpm tauri dev        # or scripts/dev.sh
```

> `pnpm dev` only starts the web part (Vite) and does **not** build the Rust backend: for the desktop app always
> use `pnpm tauri dev`.

**5. Check everything** (lint, formatting and frontend + Rust tests):

```bash
scripts/check.sh      # or, separately:
pnpm lint && pnpm format:check && pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

**6. Build:**

| What you want                     | Command                                             | Result                                                     |
| --------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Just the executable, no installer | `pnpm tauri build --no-bundle`                      | `src-tauri/target/release/gitleviatan` (`.exe` on Windows) |
| Packages for the current system   | `scripts/build.sh --bundle` (or `pnpm tauri build`) | See the next table                                         |
| Windows installer with Inno Setup | `scripts\build-windows.ps1` (PowerShell)            | `dist-installer\GitLeviatan_<version>_x64-inno-setup.exe`  |

`scripts/build.sh` also accepts `--check` (runs the tests first) and, on Windows from Git Bash, `--inno`.

| System  | Generated packages and where they end up (`src-tauri/target/release/bundle/…`)                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux   | `deb/GitLeviatan_<version>_amd64.deb` and `appimage/GitLeviatan_<version>_amd64.AppImage`                                                                                                                                           |
| Windows | `nsis/GitLeviatan_<version>_x64-setup.exe` (NSIS installer)                                                                                                                                                                         |
| macOS   | `dmg/GitLeviatan_<version>_<architecture>.dmg`. Universal (Intel + Apple Silicon): `pnpm tauri build --target universal-apple-darwin --bundles dmg`, which ends up in `src-tauri/target/universal-apple-darwin/release/bundle/dmg/` |

To install the generated `.deb`: `sudo apt install ./src-tauri/target/release/bundle/deb/GitLeviatan_*_amd64.deb`.
The Inno Setup installer needs [Inno Setup](https://jrsoftware.org/isdl.php) 6.3 or later; more details in
[docs/platforms.md](docs/platforms.md). E2E tests are explained in [docs/e2e.md](docs/e2e.md) (`pnpm e2e`).

**Common problems**

- **`rustc` crashes with `SIGSEGV` while building `tauri-build`** (seen with Rust 1.99.1): pin the previous version
  inside the project with `rustup toolchain install 1.99.0 && rustup override set 1.99.0`. Remove it with
  `rustup override unset`.
- **On Windows, `link.exe` is not found:** the Visual Studio Build Tools with the C++ workload are missing.
- **The AppImage is not generated because FUSE is missing:** `APPIMAGE_EXTRACT_AND_RUN=1 pnpm tauri build` (the
  `scripts/build.sh` script already does it).
- **When opening GitLeviatán's own repository with `pnpm tauri dev`, switching branches reloads the app:** Git
  rewrites the source files and Vite reloads the UI. It does not happen with another repository or the installed app.

### Privacy

Local-first: no accounts, no telemetry, no own backend. Git hooks and repository
configuration can run local commands with your user permissions.

## Documentación / Docs

- [Arquitectura](docs/architecture.md) · [Atajos de teclado](docs/shortcuts.md) · [Rendimiento](docs/performance.md) · [E2E](docs/e2e.md) · [Plataformas](docs/platforms.md)
- [Changelog](CHANGELOG.md)
- [Decisiones (ADRs)](docs/decisions/)
- [Contribuir](CONTRIBUTING.md) · [Código de conducta](CODE_OF_CONDUCT.md) · [Seguridad](SECURITY.md)
