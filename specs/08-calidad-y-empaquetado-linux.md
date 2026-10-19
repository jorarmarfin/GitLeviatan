# SPEC 08 — Calidad y empaquetado Linux

> **Estado:** Implemented
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05, SPEC 06, SPEC 07
> **Fecha:** 2026-10-19
> **Objetivo:** Dejar el MVP como release candidata usable en Ubuntu, con manejo de errores uniforme, umbrales de rendimiento medidos, auditoría de dependencias, pruebas E2E y paquetes `.deb` y AppImage.

## Por qué existe esta spec

Es la Fase 5. Convierte un conjunto de funciones en un producto distribuible y fija los criterios cuantitativos que el documento deja pendientes "tras el primer prototipo".

## Alcance

**Dentro:**

- Tipo de error único `AppError { kind, message, detail }` usado por todos los comandos.
- Notificaciones con contexto y botón "ver detalle técnico" en todas las operaciones.
- Umbrales de rendimiento definidos a partir de `docs/performance.md` (SPEC 03) y comprobados en una prueba automatizada.
- Atajos de teclado documentados en `docs/shortcuts.md` y navegación por teclado en las vistas principales.
- Revisión de contraste en tema claro y oscuro.
- CI: `cargo audit`, `pnpm audit` y comprobación de licencias de dependencias.
- Pruebas E2E de los flujos abrir → stage → commit → navegar historial.
- Paquetes `.deb` y AppImage generados por `pnpm tauri build`.
- `CHANGELOG.md` y workflow de release que adjunta los paquetes a un tag.
- Documentación de dependencias del paquete Linux en el README.

**Fuera de alcance (para specs futuras):**

- Windows y macOS (SPEC 09).
- Firma de paquetes, repositorio APT y Flatpak/Snap.
- Actualizaciones automáticas.
- Funciones nuevas de Git.
- Reportes de fallos o telemetría (no se añaden, por principio).

## Modelo de datos

```ts
type AppErrorKind =
  | "git" | "auth" | "network" | "validation" | "io" | "notFound" | "cancelled" | "internal";

type AppError = { kind: AppErrorKind; message: string; detail: string | null };
```

Convenciones:

- `message` es legible por personas; `detail` conserva el stderr saneado.
- Los umbrales viven en `tests/perf/thresholds.json` con el formato `{ "<métrica>": { "maxMs": number } }`.
- Los valores numéricos se fijan al ejecutar el paso 3 con base en la línea base medida.

## Plan de implementación

1. Introducir `AppError` en Rust y migrar los comandos existentes. Pruebas de conversión de errores.
2. Crear el componente de notificaciones con detalle técnico y usarlo en todas las features.
3. Definir `tests/perf/thresholds.json` desde la línea base y añadir la prueba que lo comprueba.
4. Documentar y revisar los atajos y la navegación por teclado; corregir los fallos detectados.
5. Revisar el contraste de los dos temas y corregir los tokens que no cumplan AA.
6. Añadir `cargo audit`, `pnpm audit` y la verificación de licencias al CI.
7. Configurar E2E con `tauri-driver` y escribir los flujos sobre repositorios temporales.
8. Configurar los targets `deb` y `appimage` en `tauri.conf.json` y verificar la instalación en Ubuntu limpio.
9. Escribir `CHANGELOG.md`, el workflow de release por tag y actualizar el README con las dependencias.

## Criterios de aceptación

- [ ] Todo comando que falla devuelve un `AppError` con `kind` y `message` legibles.
- [ ] Cada error mostrado en la UI permite ver el detalle técnico.
- [ ] `tests/perf/thresholds.json` existe y la prueba de rendimiento pasa en CI.
- [ ] Todas las vistas principales se pueden operar solo con teclado.
- [ ] `docs/shortcuts.md` lista todos los atajos existentes.
- [ ] El texto de la interfaz cumple contraste AA en tema claro y oscuro.
- [ ] CI ejecuta `cargo audit` y `pnpm audit` y falla ante vulnerabilidades altas o críticas.
- [ ] El flujo E2E abrir → stage → commit → ver el commit en el historial pasa en CI.
- [ ] `pnpm tauri build` genera un `.deb` y un AppImage.
- [ ] El `.deb` se instala en Ubuntu limpio y la app arranca; el AppImage se ejecuta.
- [ ] Un tag `vX.Y.Z` dispara el workflow de release que adjunta ambos paquetes.
- [ ] La app no realiza peticiones de red salvo las operaciones Git solicitadas.

## Decisiones

- **Sí:** `.deb` y AppImage. Cubren instalación de sistema y portable. Propuesta del documento sin cerrar ("`.deb` y/o AppImage"); confirmar al aprobar.
- **No:** Flatpak/Snap. Más mantenimiento sin demanda confirmada.
- **Sí:** fijar umbrales tras medir. El documento lo exige explícitamente.
- **Sí:** auditoría en CI en esta spec. Se difirió desde SPEC 01 para no inflar el bootstrap.
- **No:** firmado de paquetes ni actualizaciones automáticas. Requieren infraestructura de claves y verificación.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| `tauri-driver` inestable en CI | Limitar E2E a un flujo corto; ejecutarlo en un job aparte. |
| Falsos positivos de `cargo audit` | Permitir excepciones documentadas en `docs/decisions/`. |
| Licencias de dependencias incompatibles con GPL-3.0 | Comprobación en CI antes de la primera release. |
| Dependencias de sistema del AppImage varían entre distros | Probar en Ubuntu limpio y documentar la versión mínima. |

## Lo que **no** está en esta spec

- Windows, macOS, firma, Flatpak/Snap y actualizaciones automáticas.
- Nuevas funciones de Git.

Cada uno entra, si llega, en su propia spec.
