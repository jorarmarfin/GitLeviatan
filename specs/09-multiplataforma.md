# SPEC 09 — Soporte para Windows y macOS

> **Estado:** Implemented
> **Depende de:** SPEC 08
> **Fecha:** 2026-10-19
> **Objetivo:** Compilar, probar y empaquetar GitLeviatán en Windows y macOS con los mismos criterios de calidad que en Ubuntu.

## Por qué existe esta spec

Es la parte multiplataforma de la Fase 6. Las "funciones avanzadas" de esa fase (conflictos, hunks, stash, rebase, etc.) se excluyen a propósito: cada una merece su propia spec.

## Alcance

**Dentro:**

- Matriz de CI con `windows-latest` y `macos-latest` además de Ubuntu: lint, tests y build.
- Localización del ejecutable Git en Windows (`git.exe`) y macOS, respetando `gitPath` (SPEC 07).
- Manejo de rutas con separadores, unidades y rutas largas de Windows.
- Finales de línea (`autocrlf`) sin falsos cambios en la pantalla de estado.
- SSH agent de Windows (OpenSSH) y Keychain de macOS a través de Git; sin código propio de credenciales.
- Paquetes: `.msi` o NSIS en Windows y `.dmg` en macOS, sin firmar.
- Directorio de configuración correcto por plataforma para `settings.json` y `recent.json`.
- Pruebas de integración de Rust ejecutadas en las tres plataformas.
- README con requisitos y advertencia de paquetes sin firmar.

**Fuera de alcance (para specs futuras):**

- Firma de código y notarización de macOS.
- Tiendas de aplicaciones (Microsoft Store, Mac App Store).
- Linux distinto de Ubuntu y arquitecturas ARM.
- Resolución de conflictos, hunks, stash, tags, cherry-pick, revert, reset, rebase interactivo, reflog, worktrees, submódulos, terminal integrada y asistente de IA.
- Actualizaciones automáticas y localización.

## Modelo de datos

Esta spec no introduce estructuras de datos nuevas. Reutiliza `Settings` (SPEC 07) y los tipos de `src/types/git.ts` (SPEC 02).

Convenciones:

- Las rutas se tratan como `PathBuf` en Rust y como texto opaco en el frontend.
- Los fixtures de prueba no dependen de separadores ni de finales de línea del sistema.

## Plan de implementación

1. Añadir la matriz de CI con las tres plataformas ejecutando solo lint y tests. Corregir lo que falle.
2. Ajustar las pruebas de integración de Rust para rutas y finales de línea portables.
3. Implementar la detección de Git por plataforma y las rutas largas de Windows. Pruebas condicionales por SO.
4. Verificar que `autocrlf` no genera cambios falsos en `get_status`. Prueba con un repositorio configurado.
5. Añadir el build `tauri build --no-bundle` a la matriz.
6. Configurar los targets de empaquetado (`msi`/`nsis`, `dmg`) en el workflow de release.
7. Verificación manual de clone SSH/HTTPS en Windows y macOS con credenciales existentes.
8. Actualizar el README con requisitos, instalación y avisos de paquetes sin firmar.

## Criterios de aceptación

- [ ] CI pasa en verde en Ubuntu, Windows y macOS.
- [ ] Las pruebas de integración de Rust pasan en las tres plataformas.
- [ ] La app arranca en Windows y macOS y abre un repositorio existente.
- [ ] En Windows, un repositorio con `autocrlf=true` no muestra archivos modificados falsos.
- [ ] Las preferencias se guardan en el directorio de configuración propio de cada SO.
- [ ] Se genera un instalador para Windows y un `.dmg` para macOS en el workflow de release.
- [ ] Clone, fetch y push funcionan con las credenciales ya configuradas en cada SO.
- [ ] El README documenta requisitos y limitaciones de cada plataforma.

## Decisiones

- **Sí:** reutilizar el diseño local-first y delegar credenciales en Git. Sin código específico por SO para autenticación.
- **No:** firmar ni notarizar. Requiere cuentas y certificados de pago; se decide más adelante.
- **No:** incluir funciones avanzadas del documento (v0.2+). Cada una es una spec distinta.
- **Sí:** matriz de CI desde el paso 1. Detecta problemas de portabilidad antes de acumularlos.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Diferencias de comportamiento de Git entre SO | Pruebas de integración en la matriz y `LC_ALL=C` al parsear. |
| Rutas largas y caracteres no ASCII en Windows | Pruebas con nombres Unicode y rutas largas. |
| Avisos de SmartScreen y Gatekeeper por paquetes sin firmar | Documentar en el README cómo ejecutarlos. |
| Runners de macOS y Windows más lentos y caros | Ejecutar el build completo solo en `main` y en tags. |

## Lo que **no** está en esta spec

- Firma, notarización y tiendas de aplicaciones.
- Funciones avanzadas de Git (v0.2+) y localización.
- Otras distribuciones Linux y arquitecturas ARM.

Cada uno entra, si llega, en su propia spec.
