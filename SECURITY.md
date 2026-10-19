# Política de seguridad

## Reportar una vulnerabilidad

No abras un issue público. Usa el reporte privado de vulnerabilidades de GitHub
(_Security → Report a vulnerability_) en el repositorio del proyecto.
Responderemos lo antes posible y coordinaremos la divulgación.

## Versiones soportadas

Solo la última versión publicada.

## Modelo de amenazas (resumen)

- Local-first: GitLeviatán no tiene backend ni telemetría.
- Las capabilities de Tauri son mínimas; el frontend no tiene shell arbitraria ni acceso directo al sistema de archivos.
- Los hooks de Git y la configuración del repositorio pueden ejecutar comandos locales con los permisos del usuario. Abre solo repositorios de confianza.
- Las credenciales se delegan en el SSH agent y en los credential helpers de Git; no se guardan en texto plano.
