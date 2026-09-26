import { blockingShape, type BlockingInput } from "../schemas/tuning.js";
import { getBlocking } from "../domain/tuning.js";
import { clampLimit } from "../sql/tuning.js";
import { withSqlSearchClient, textResult, type McpToolResponse } from "./shared.js";
import { withOverrides, type CatalogToolDeps } from "./catalog-shared.js";
import { tuningErrorResult, VIEW_SERVER_STATE } from "./tuning-shared.js";

export const name = "sqlserver_tuning_blocking";
export const description =
  "Tuning (solo lectura): requests activos, bloqueos y consultas largas (sys.dm_exec_requests/sessions): sesión, sesión que bloquea, base, estado, espera, ms transcurridos, login, host, programa y sentencia. Reporta también sesiones inactivas que bloquean (transacción abierta). Excluye la sesión del propio MCP. Requiere VIEW SERVER STATE.";
export const inputSchema = blockingShape;

export async function execute(input: BlockingInput, deps: CatalogToolDeps): Promise<McpToolResponse> {
  const { connection, server, user, password } = input;
  const onlyBlocked = input.onlyBlocked ?? false;
  const minElapsedMs = Math.max(0, Math.trunc(Number(input.minElapsedMs) || 0));
  const limit = clampLimit(input.limit, 100, 500);
  try {
    const result = await withSqlSearchClient(withOverrides(deps, { server, user, password }), connection, (client) =>
      getBlocking(client, { onlyBlocked, minElapsedMs, limit })
    );
    const bloqueados = result.requests.filter((row) => row.blocking_session_id !== 0).length;
    const lines = [
      `⏳ Requests activos (conexión: ${connection}${onlyBlocked ? ", solo bloqueados" : ""}, mínimo ${minElapsedMs} ms) — ${result.requests.length} requests, ${bloqueados} bloqueados`,
      JSON.stringify(result.requests, null, 2),
    ];
    if (result.idleBlockers.length > 0) {
      lines.push(
        `🚧 Sesiones INACTIVAS que bloquean (sin request activo, probablemente con transacción abierta): ${result.idleBlockers.length}`,
        JSON.stringify(result.idleBlockers, null, 2)
      );
    }
    return textResult(lines.join("\n"));
  } catch (err) {
    return tuningErrorResult(err, VIEW_SERVER_STATE);
  }
}
