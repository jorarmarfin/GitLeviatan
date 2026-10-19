# SPEC 07 — Preferencias locales

> **Estado:** Implemented
> **Depende de:** SPEC 02
> **Fecha:** 2026-10-19
> **Objetivo:** Guardar las preferencias básicas (tema, ubicación del ejecutable Git y repositorios recientes) en un archivo de configuración local, con una pantalla de ajustes y detección de Git.

## Por qué existe esta spec

El MVP exige "preferencias básicas: tema, ubicación de Git y repositorios recientes". Hasta ahora el tema vive en `localStorage` (SPEC 01) y Git se busca en el `PATH` (SPEC 02). Esta spec mueve todo a un archivo único y añade el manejo de "Git no encontrado".

## Alcance

**Dentro:**

- Archivo `settings.json` versionado en el directorio de configuración de la app.
- Pantalla de Preferencias con tema, ruta de Git y repositorios recientes.
- Selector de ruta del ejecutable Git, validado con `--version`.
- Detección de Git al arrancar y estado de error claro si no se encuentra.
- Migración única del tema desde `localStorage` al archivo.
- Opción de limpiar la lista de recientes y definir cuántos se conservan (5–50).
- Comandos `get_settings` y `update_settings`.

**Fuera de alcance (para specs futuras):**

- Atajos de teclado configurables.
- Idioma de la interfaz (localización).
- Preferencias por repositorio.
- Sincronización de preferencias entre equipos.
- SQLite.

## Modelo de datos

```ts
type Settings = {
  version: 1;
  theme: "light" | "dark" | "system";
  gitPath: string | null;     // null = buscar en PATH
  maxRecentRepositories: number; // 5–50, por defecto 20
};
```

```jsonc
// <config_dir>/settings.json
{ "version": 1, "theme": "system", "gitPath": null, "maxRecentRepositories": 20 }
```

Convenciones:

- `recent.json` (SPEC 02) conserva su formato; solo cambia su límite.
- Escritura atómica (archivo temporal + rename).
- Un archivo ilegible o con otra versión se renombra a `settings.json.bak` y se recrea con valores por defecto.

## Plan de implementación

1. Crear `storage/settings.rs` con lectura, escritura atómica, valores por defecto y recuperación de archivo corrupto. Pruebas Rust.
2. Comandos `get_settings` y `update_settings` con validación de rangos.
3. Hacer que `git/process.rs` use `gitPath` cuando exista. Prueba con una ruta falsa y con una válida.
4. Detectar Git al arrancar con `git --version` y mostrar la pantalla de error si falla.
5. Crear `features/settings` con el diálogo de Preferencias.
6. Mover el tema a `Settings` con migración desde `localStorage` y borrado de la clave antigua.
7. Aplicar el límite de recientes y la acción de limpiar.

## Criterios de aceptación

- [ ] Cambiar el tema persiste tras reiniciar sin usar `localStorage`.
- [ ] Un usuario con tema en `localStorage` conserva su elección tras actualizar (migración única).
- [ ] Sin Git instalado, la app muestra una pantalla que explica cómo instalarlo y no falla.
- [ ] Una ruta de Git inválida se rechaza con un mensaje y no se guarda.
- [ ] Una ruta de Git válida se usa en las operaciones siguientes sin reiniciar.
- [ ] `settings.json` corrupto se respalda en `settings.json.bak` y la app arranca con valores por defecto.
- [ ] Limpiar recientes vacía la lista y el cambio persiste.
- [ ] `maxRecentRepositories` fuera de 5–50 se rechaza.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** archivo JSON versionado. Cumple "archivo de configuración local; SQLite solo si se justifica".
- **No:** SQLite. No hay consultas ni volumen que lo justifique.
- **Sí:** migrar desde `localStorage`. Evita perder la preferencia de quien ya usó la app.
- **Sí:** respaldar un archivo corrupto en lugar de borrarlo. No se pierde información recuperable.
- **No:** guardar credenciales o tokens aquí. Se delegan en Git y el sistema.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Ruta de Git apuntando a un binario malicioso | Es una elección explícita del usuario; documentarlo en `SECURITY.md`. |
| Carrera al escribir el archivo | Escritura atómica y un único escritor en el proceso Rust. |
| Cambio futuro del esquema | Campo `version`; las migraciones se documentan en `storage/settings.rs`. |

## Lo que **no** está en esta spec

- Atajos configurables, localización, preferencias por repositorio y sincronización.

Cada uno entra, si llega, en su propia spec.
