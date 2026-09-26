import { searchObjectsShape, type SearchObjectsInput } from "../schemas/catalog.js";
import { searchObjects } from "../domain/catalog.js";
import { withSqlSearchClient, textResult, errorResult, type McpToolResponse } from "./shared.js";
import { withOverrides, type CatalogToolDeps } from "./catalog-shared.js";

export const name = "sqlserver_search_objects";
export const description =
  "Busca un texto en nombres de tablas, vistas, procedimientos y funciones (y opcionalmente columnas) en TODAS las bases ONLINE accesibles por el login, o en las indicadas en `databases`. Las bases que fallen se omiten y se reportan.";
export const inputSchema = searchObjectsShape;

export async function execute(input: SearchObjectsInput, deps: CatalogToolDeps): Promise<McpToolResponse> {
  const { connection, text, includeColumns, databases, includeSystem, limit, server, user, password } = input;
  try {
    const result = await withSqlSearchClient(withOverrides(deps, { server, user, password }), connection, (client) =>
      searchObjects(client, {
        text,
        databases,
        includeColumns: includeColumns ?? false,
        includeSystem: includeSystem ?? false,
        limit,
      })
    );

    const lines = [
      `🔎 Búsqueda de "${text}" (conexión: ${connection}) — coincidencias: ${result.matches.length}${
        result.truncated ? ` (cortado en limit=${limit})` : ""
      }, bases consultadas: ${result.searched.length}`,
    ];
    if (result.rejected.length > 0) {
      lines.push(`⚠️ Bases pedidas no accesibles u OFFLINE (ignoradas): ${result.rejected.join(", ")}`);
    }
    if (result.skipped.length > 0) {
      lines.push(
        `⚠️ Bases omitidas por error:\n${result.skipped.map((s) => `- ${s.database}: ${s.reason}`).join("\n")}`
      );
    }
    lines.push(JSON.stringify(result.matches, null, 2));
    return textResult(lines.join("\n"));
  } catch (err) {
    return errorResult(err);
  }
}
