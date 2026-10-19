# Plataformas soportadas

| Plataforma | Paquete                                              | Estado de la verificación                        |
| ---------- | ---------------------------------------------------- | ------------------------------------------------ |
| Ubuntu     | `.deb` y AppImage                                    | Verificada (SPEC 08)                             |
| Windows    | Instalador NSIS (`.exe`), sin firmar                 | CI en `windows-latest`; manual pendiente (abajo) |
| macOS      | `.dmg` universal (Intel + Apple Silicon), sin firmar | CI en `macos-latest`; manual pendiente (abajo)   |

Fuera de alcance: firma de código y notarización, tiendas de aplicaciones, otras distribuciones Linux y
arquitecturas ARM en Linux/Windows.

## Cómo encuentra Git la app

Por orden: (1) la ruta de **Preferencias** (`gitPath`), (2) `git` en el `PATH`, (3) sitios habituales:

- **Windows:** `%ProgramFiles%\Git\cmd\git.exe`, `%ProgramFiles(x86)%\Git\cmd\git.exe`,
  `%LOCALAPPDATA%\Programs\Git\cmd\git.exe`.
- **macOS:** `/opt/homebrew/bin/git` (Apple Silicon), `/usr/local/bin/git` (Intel), `/usr/bin/git`.
  Una app abierta desde el Finder recibe un `PATH` mínimo sin Homebrew; por eso el paso 3.
  Si solo existe `/usr/bin/git` y no están instaladas las Command Line Tools, macOS ofrecerá instalarlas
  (`xcode-select --install`).
- **Linux:** `/usr/local/bin/git`, `/usr/bin/git`.

Si no aparece ninguno, la app muestra la pantalla «No se encontró Git».

## Credenciales

La app no tiene código de credenciales propio: lo hace Git.

- **Windows:** ssh-agent de OpenSSH (servicio `ssh-agent`) y Git Credential Manager (incluido con Git for Windows) para HTTPS.
- **macOS:** Keychain a través de `credential.helper=osxkeychain` (o Git Credential Manager) y `ssh-agent`/`UseKeychain`.
- Con `GIT_TERMINAL_PROMPT=0` Git nunca espera en una terminal; si hace falta autenticarse y no hay credencial
  guardada, la operación falla con el mensaje de autenticación.

## Comportamientos específicos

- **Directorio de configuración** (`settings.json`, `recent.json`): lo decide Tauri por SO.
  Linux `~/.config/dev.gitleviatan.app/`, macOS `~/Library/Application Support/dev.gitleviatan.app/`,
  Windows `%APPDATA%\dev.gitleviatan.app\`.
- **Rutas:** Git devuelve `C:/Users/ana/repo`; la app la convierte a `C:\Users\ana\repo` para que coincida con el
  selector de carpetas y con la lista de recientes. En el frontend las rutas son texto opaco.
- **Rutas largas (Windows):** Git se ejecuta con `core.longpaths=true` y Rust usa el prefijo `\\?\` en las
  lecturas de archivos. El directorio de trabajo de un proceso sigue limitado a 260 caracteres en Windows:
  un repositorio muy anidado puede no abrirse.
- **Finales de línea:** con `core.autocrlf=true` (por defecto en Git for Windows) el estado no muestra cambios
  falsos, y el visor de diff compara el índice (LF) con el working tree sin contar los `\r`. Solo se aplica con
  `core.autocrlf`; las reglas `eol=` de `.gitattributes` no se interpretan en el visor.
- **Consola:** en Windows, Git se lanza sin abrir ventanas de consola. Cancelar una operación termina todo el
  árbol de procesos (`taskkill /T`).

## Compilar los paquetes en tu máquina

Cada sistema genera los paquetes de su propia plataforma (no se puede crear el `.exe` desde Linux).

| Sistema | Comando                                  | Resultado                                                              |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Linux   | `scripts/build.sh --bundle`              | `src-tauri/target/release/bundle/deb/*.deb` y `appimage/*.AppImage`    |
| macOS   | `scripts/build.sh --bundle`              | `src-tauri/target/release/bundle/dmg/*.dmg`                            |
| Windows | `scripts/build.sh --bundle` (Git Bash)   | `src-tauri\target\release\bundle\nsis\*-setup.exe` (instalador NSIS)   |
| Windows | `scripts\build-windows.ps1` (PowerShell) | `dist-installer\GitLeviatan_<versión>_x64-inno-setup.exe` (Inno Setup) |

`scripts/build.sh` sin opciones solo compila el binario. Opciones: `--check` (lint, formato y tests antes),
`--bundle` (paquetes del sistema actual) e `--inno` (solo Windows desde Git Bash: delega en el script de PowerShell).

### Instalador con Inno Setup (Windows)

`scripts/build-windows.ps1` compila con `pnpm tauri build --no-bundle` y empaqueta el `.exe` con
`installer/windows/gitleviatan.iss`. Requisitos: Node 24+, pnpm 10+, Rust (toolchain `msvc` y Visual Studio Build
Tools con la carga «Desarrollo para el escritorio con C++»), Git for Windows e
[Inno Setup](https://jrsoftware.org/isdl.php) 6.3 o superior (el script busca `ISCC.exe` en el `PATH` y en
`Archivos de programa`).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1          # compila y empaqueta
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Check   # además lint y tests
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -SkipBuild  # solo reempaqueta
```

El instalador se instala por usuario (sin pedir administrador), avisa si falta WebView2 y está en español e
inglés. **El script y el `.iss` aún no se han ejecutado en Windows**: si algo falla, es lo primero que hay que revisar.
El instalador oficial de las releases sigue siendo el NSIS que genera el CI; el de Inno Setup es para uso local.

## Paquetes sin firmar

- **Windows (SmartScreen):** «Windows protegió su PC» → **Más información** → **Ejecutar de todas formas**.
- **macOS (Gatekeeper):** clic derecho sobre la app → **Abrir** → **Abrir**. Si dice que está dañada:
  `xattr -dr com.apple.quarantine /Applications/GitLeviatan.app`.

Las sumas SHA-256 de cada release están en `SHA256SUMS.txt`.

## Verificación manual pendiente (SPEC 09, paso 7)

Requiere máquinas reales; el CI no puede comprobarla. Marcar al hacerla.

**Windows**

- [ ] El instalador se ejecuta y la app arranca.
- [ ] Abre un repositorio existente (también uno con espacios y con caracteres no ASCII en la ruta).
- [ ] Repositorio con `core.autocrlf=true`: el estado no lista archivos modificados falsos.
- [ ] Clone por SSH con la clave cargada en `ssh-agent`.
- [ ] Clone por HTTPS con Git Credential Manager.
- [ ] Fetch y push al remoto clonado.
- [ ] `settings.json` y `recent.json` aparecen en `%APPDATA%\dev.gitleviatan.app\`.

**macOS**

- [ ] El `.dmg` se abre y la app arranca (Gatekeeper: ver arriba) tanto en Intel como en Apple Silicon.
- [ ] Abre la app desde el Finder (sin terminal) y encuentra Git de Homebrew.
- [ ] Abre un repositorio existente.
- [ ] Clone por SSH (`ssh-agent` / Keychain) y por HTTPS (`osxkeychain`).
- [ ] Fetch y push al remoto clonado.
- [ ] `settings.json` y `recent.json` aparecen en `~/Library/Application Support/dev.gitleviatan.app/`.
