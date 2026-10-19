# SPEC 11 — Cerrar el proyecto y quitarlo de recientes

> **Estado:** Approved
> **Depende de:** SPEC 02, SPEC 07, SPEC 08
> **Fecha:** 2026-10-19
> **Objetivo:** Permitir cerrar el repositorio abierto para volver a la pantalla inicial y quitar un proyecto concreto de la lista de recientes, sin tener que borrar toda la lista.

## Por qué existe esta spec

Hoy la lista de **Recientes** solo crece. La única forma de vaciarla es **Preferencias → Limpiar recientes**, que borra todos los proyectos a la vez. Tampoco hay forma de cerrar el repositorio abierto: solo se puede cambiar a otro. Quien prueba la app con varios proyectos se queda con una lista llena de entradas que ya no usa.

## Alcance

**Dentro:**

- Comando `remove_recent_repository(path)`: quita una entrada de `recent.json`.
- Botón **×** junto a cada proyecto de Recientes, con el nombre accesible «Quitar _nombre_ de recientes». Solo borra la entrada de la lista: no toca el repositorio ni los archivos del disco.
- Botón **Cerrar repositorio** en la cabecera, junto al nombre del proyecto abierto, que vuelve a la pantalla inicial.
- El botón de cerrar se deshabilita mientras haya un fetch, pull o push en curso, con una explicación en su título.
- Quitar de recientes el proyecto que está abierto lo mantiene abierto; la entrada reaparece si se vuelve a abrir.
- Mostrar el error con contexto y detalle técnico si no se puede guardar el cambio.
- Todo operable con teclado y con colores solo desde los tokens de `index.css`.

**Fuera de alcance (para specs futuras):**

- Recordar qué proyecto estaba abierto al reiniciar la app.
- Varios proyectos abiertos a la vez o pestañas.
- Fijar, ordenar o agrupar proyectos.
- Borrar un repositorio del disco.
- Un atajo de teclado global dedicado.
- Búsqueda o plegado en la barra lateral de ramas.

## Modelo de datos

Esta spec no introduce estructuras de datos nuevas. Reutiliza `RecentRepository` (SPEC 02) y `AppError` (SPEC 08). `recent.json` conserva su formato.

Convenciones:

- Comando: `remove_recent_repository(path)`, devuelve `void`. Quitar una ruta que no está en la lista no es un error.
- La ruta se compara tal como está guardada (la que devolvió `open_repository`).
- Cerrar el repositorio solo cambia el estado del frontend (`active = null`); el backend conserva el registro del repositorio, de modo que reabrirlo reutiliza el mismo identificador.
- Mientras hay una operación de red en curso, el panel de sincronización avisa al estado global para que la cabecera pueda deshabilitar **Cerrar repositorio**.

## Plan de implementación

1. Añadir `RecentStore::remove` en `storage/recent.rs`. Pruebas: quitar una entrada conserva el orden de las demás, quitar una ruta ausente no falla, el cambio persiste tras recargar y un archivo corrupto no rompe la operación.
2. Exponer `remove_recent_repository` en `commands/` y `lib.rs`, añadirlo a `lib/api.ts` y crear la acción `removeRecent(path)` en el store de repositorios, que recarga la lista. Pruebas del store, incluido el error con contexto.
3. Añadir el botón **×** en `RecentRepositories`: visible al pasar el ratón y al enfocar con teclado, sin abrir el proyecto al pulsarlo. Pruebas de componente: clic, teclado (Tab y Enter o Espacio) y que no abre el repositorio.
4. Añadir `closeRepository()` al store y el botón **Cerrar repositorio** en la cabecera. Registrar en el store si hay una operación de red en curso desde el panel de sincronización. Pruebas: vuelve a la pantalla inicial, reinicia la selección, no aparece sin repositorio y se deshabilita durante un fetch.
5. Cubrir los casos límite: quitar de recientes el proyecto abierto, cerrar y reabrir desde Recientes, y quitar el último proyecto de la lista (mensaje de lista vacía).
6. Actualizar `docs/shortcuts.md` y `CHANGELOG.md`.

## Criterios de aceptación

- [ ] Cada proyecto de Recientes tiene un botón para quitarlo, y quitarlo no borra nada del disco.
- [ ] El cambio persiste tras reiniciar la app.
- [ ] Quitar un proyecto no afecta a los demás ni a su orden.
- [ ] Quitar el proyecto abierto no lo cierra.
- [ ] **Cerrar repositorio** vuelve a la pantalla inicial y el proyecto se puede reabrir desde Recientes.
- [ ] **Cerrar repositorio** está deshabilitado durante fetch, pull o push, y explica por qué.
- [ ] Ambos botones se alcanzan con Tab y se activan con Enter o Espacio, y el de quitar tiene un nombre accesible con el nombre del proyecto.
- [ ] Un fallo al guardar se muestra con contexto y detalle técnico.
- [ ] Los colores nuevos salen de los tokens y cumplen contraste AA en ambos temas.
- [ ] `pnpm lint`, `pnpm test`, `cargo test` y `cargo clippy -- -D warnings` terminan con código 0.

## Decisiones

- **Sí:** quitar una entrada solo de la lista. Es lo que pide el uso real y no es destructivo.
- **No:** pedir confirmación. Ninguna de las dos acciones borra datos: el proyecto se vuelve a abrir con **Abrir repositorio**.
- **Sí:** cerrar es estado del frontend, sin comando de backend. El registro de repositorios es pequeño y reutiliza el identificador al reabrir; desregistrar no aporta nada.
- **Sí:** deshabilitar **Cerrar repositorio** durante una operación de red. Cerrarlo desmontaría el panel de sincronización y el usuario perdería la barra de progreso y el botón Cancelar de una operación que sigue en marcha.
- **No:** cancelar automáticamente la operación al cerrar. Mejor que el usuario decida pulsando Cancelar.
- **No:** atajo de teclado dedicado, por la misma razón que en la SPEC 10: los botones ya son operables con teclado. Propuesta por defecto; confirmar al aprobar.
- **Sí:** mostrar la **×** también al enfocar con teclado, no solo al pasar el ratón, para que no sea invisible para quien usa teclado.
- **Sí:** definición rápida sin aclaración detallada. Escrita sin ronda de preguntas a petición del usuario; revisar al aprobar.

## Riesgos identificados

| Riesgo | Mitigación |
| ------ | ---------- |
| Quitar un proyecto por error al hacer clic cerca de su nombre | La **×** es un botón aparte, a la derecha, con un área de clic propia; reabrir el proyecto con **Abrir repositorio** devuelve la entrada. |
| El botón × oculto hasta pasar el ratón no es descubrible con teclado | Visible también con `:focus-visible` y `:focus-within`; prueba de que se alcanza con Tab. |
| Estado de «operación en curso» desincronizado si el panel falla | El panel lo limpia siempre al terminar (con éxito, error o cancelación) y al desmontarse. |
| `recent.json` modificado a mano o corrupto | `RecentStore` ya trata un archivo ilegible como lista vacía; la prueba cubre quitar sobre un archivo corrupto. |

## Lo que **no** está en esta spec

- Reabrir automáticamente el último proyecto, varios proyectos a la vez, fijar o agrupar.
- Borrar repositorios del disco.
- Atajos de teclado globales nuevos, y búsqueda o plegado de ramas.

Cada uno entra, si llega, en su propia spec.
