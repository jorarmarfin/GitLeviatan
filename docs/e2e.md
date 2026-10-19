# Pruebas E2E

Cubren el flujo **abrir → preparar → commit → ver el commit en el historial** sobre la app real (build debug
de Tauri), manejada por WebDriver con [`tauri-driver`](https://v2.tauri.app/develop/tests/webdriver/).

## Cómo funciona

- `tests/e2e/fixture.mjs` crea un repositorio temporal (un commit y un `nuevo.txt` sin seguimiento) y una carpeta
  de configuración propia (`XDG_CONFIG_HOME`) cuyo `recent.json` ya lista ese repositorio. Así el test abre el
  repositorio **desde la lista de recientes**, sin diálogos nativos, que WebDriver no puede manejar.
- `tests/e2e/wdio.conf.mjs` arranca `tauri-driver` con ese entorno y lanza `src-tauri/target/debug/gitleviatan`.
- `tests/e2e/specs/commit-flow.e2e.mjs` es el único flujo (corto a propósito: `tauri-driver` es la pieza menos
  estable del CI). Al final comprueba con la CLI de Git que el commit existe y que el árbol quedó limpio.

## Requisitos (Ubuntu)

```bash
sudo apt-get install -y webkit2gtk-driver xvfb   # WebKitWebDriver + pantalla virtual
cargo install tauri-driver --locked
pnpm install
pnpm tauri build --debug --no-bundle              # genera src-tauri/target/debug/gitleviatan
```

## Ejecutar

```bash
xvfb-run -a pnpm e2e     # sin entorno gráfico; con uno, basta `pnpm e2e`
```

En CI corre en un job aparte (`e2e` en `.github/workflows/ci.yml`).
