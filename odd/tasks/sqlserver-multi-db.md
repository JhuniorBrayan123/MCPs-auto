# Feature: mcp-sqlserver multi-base de datos + tuning

Locator: `odd/tasks/sqlserver-multi-db.md` (repo MCPs) · Engram: `odd/sqlserver-multi-db/tasks` (proyecto `mcps-auto`)
Rama: `feat/sqlserver-multi-db` (desde `main` @ 1431ddd)

## Objetivo
Que `tools/mcp-sqlserver` trabaje con **todas** las bases de datos a las que el login tenga acceso usando **una sola credencial por servidor**, en vez de una base fija por perfil. Añadir herramientas de solo lectura de tuning.

## Problema / Por qué
Hoy cada perfil (`dev`/`drt`/`prd`) se piensa como "una base": `sqlserver_get_schema` solo ve la base conectada y no hay forma de listar bases ni buscar objetos entre bases. El usuario quiere una credencial por conexión con acceso a todas sus bases, y consultas de tuning.

## Alcance autorizado
- Solo `tools/mcp-sqlserver/` (código, tests, README) y `.env.example` raíz.
- Sin push, sin PR, sin tocar `.env` real, `.gitignore` ni `.atl/` (cambios previos del usuario sin commitear).
- Se mantiene el guard de solo lectura (`read-only-guard.ts`) intacto para `sqlserver_query`.

## Restricciones
- Solo lectura siempre. SQL interno de las tools nuevas construido por el MCP (no por el usuario); nombres de base escapados con corchetes (`]` → `]]`) y validados contra `sys.databases`.
- `SQLSERVER_<P>_DATABASE` pasa a ser opcional (vacío = base por defecto del login, normalmente `master`). Retrocompatible.
- Permisos DMV (`VIEW SERVER STATE`) pueden faltar → error claro, no crash.
- No leer ni imprimir credenciales.

## Modo TDD
Off — no hay configuración TDD en el proyecto ni elección explícita del usuario (fuente: ninguna). Runner: `npm test` (`node --import tsx --test ...`) + `npm run build` en `tools/mcp-sqlserver`.

## Tareas
- [x] **T1 — Multi-base**: `sqlserver_list_databases`; `database` en `sqlserver_get_schema` (+ opción todos los esquemas); `sqlserver_search_objects` (tabla/vista/procedimiento/columna en todas las bases accesibles); helpers puros testeados (escape/validación de nombres, builders SQL). Ruta: delegado (writer, 2+ archivos no triviales). Checks: `npm test`, `npm run build`.
- [x] **T2 — Tuning (solo lectura)**: `sqlserver_tuning_missing_indexes`, `sqlserver_tuning_top_queries` (cpu/duración/lecturas), `sqlserver_tuning_index_usage` (índices sin uso por base), `sqlserver_tuning_blocking`. Manejo de falta de `VIEW SERVER STATE`. Ruta: delegado (writer). Checks: `npm test`, `npm run build`.
- [x] **T3 — Docs**: README (tools nuevas, credencial por servidor, permisos del DBA), `.env.example` (DATABASE opcional). Ruta: delegado junto a T2 o inline si es mecánico.

## Criterios de aceptación
- Con un perfil sin `DATABASE`, `sqlserver_list_databases` lista las bases accesibles y `sqlserver_get_schema`/`sqlserver_query` aceptan `database`.
- `sqlserver_search_objects` devuelve coincidencias de varias bases, omitiendo (y reportando) las que fallen por permisos.
- Tools de tuning devuelven resultados o un mensaje claro de permiso faltante.
- Tests y build en verde; tools existentes sin cambios de comportamiento.

## Entrega
Forecast ~550 líneas (>400). Estrategia: `ask-on-risk`; al no crearse PR en esta tarea, la estrategia de cadena se pregunta cuando el usuario decida publicar. Commits por tarea en la rama.

## Progreso / Evidencia
- **T1** — ruta: delegado (writer trigger: 11 archivos). Commit `b28a680` `feat(mcp-sqlserver): acceso a todas las bases del login con una sola credencial` (+727/−48). Verificado por el padre: `npm test` 61/61 pass, `npm run build` exit 0. Sin prueba contra servidor real. Tools: `sqlserver_list_databases`, `sqlserver_search_objects`; `get_schema` con `database` + `schema:"*"`/`allSchemas`. Decisión: procedimientos se listan `schema.nombre`.
  - RDD: assess (base 1431ddd, committed-only, untracked excluido) → tier **medium**, `review_due=true` (`slice_budget_reached`, 775 líneas). Preflight STATUS → `stop: managed_assets_outdated` (requiere `gentle-ai sync --agent claude-code`, cambia config global del usuario) → **pendiente de decisión del usuario**; boundary sigue en 1431ddd.

- **T2** — ruta: delegado (writer, 13 archivos). Commit `0497c6b` (+1065/−1). El agente se cortó al terminar la sesión tras commitear T2; el padre verificó: `npm test` 87/87 pass, `npm run build` exit 0. Tools: `sqlserver_tuning_missing_indexes`, `sqlserver_tuning_top_queries`, `sqlserver_tuning_index_usage`, `sqlserver_tuning_blocking`. Sin prueba contra servidor real.
- **T3** — ruta: inline (docs, 1 archivo no trivial + 2 mecánicos). Commit `f9beef2` (+44/−7): README, `tools/mcp-sqlserver/.env.example` (el `.env.example` raíz no tiene variables SQLSERVER), description de package.json. Build ok.
- RDD T2/T3: mismo bloqueo `managed_assets_outdated` que T1 → revisión del rango 1431ddd..f9beef2 **pendiente** hasta que el usuario decida correr `gentle-ai sync --agent claude-code`.

## Siguiente paso
Rama publicada en origin (GitHub MCPs-auto) por pedido del usuario, 2026-09-26; sin PR. Pendiente: (1) `gentle-ai sync` + revisión; (2) probar contra servidor real (`drt`); (3) registrar el MCP globalmente; (4) portar a E:/ERP2-auto; push/PR cuando decida (forecast superado: ~1800 líneas, estrategia de cadena a preguntar al publicar).
