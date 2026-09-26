import { listDatabasesShape, type ListDatabasesInput } from "../schemas/catalog.js";
import { listDatabases } from "../domain/catalog.js";
import { withSqlSearchClient, textResult, errorResult, type McpToolResponse } from "./shared.js";
import { withOverrides, type CatalogToolDeps } from "./catalog-shared.js";

export const name = "sqlserver_list_databases";
export const description =
  "Lista las bases de datos del servidor del perfil (sys.databases): estado, recovery model, nivel de compatibilidad, tamaño en MB (si el login puede verlo) y si el login tiene acceso (HAS_DBACCESS). Una sola credencial por servidor da acceso a todas sus bases.";
export const inputSchema = listDatabasesShape;

export async function execute(input: ListDatabasesInput, deps: CatalogToolDeps): Promise<McpToolResponse> {
  const { connection, includeSystem, server, user, password } = input;
  try {
    const rows = await withSqlSearchClient(withOverrides(deps, { server, user, password }), connection, (client) =>
      listDatabases(client, includeSystem ?? false)
    );
    const accesibles = rows.filter((row) => row.has_access).length;
    return textResult(
      `🗄️ Bases de datos (conexión: ${connection}, total: ${rows.length}, accesibles: ${accesibles}${
        includeSystem ? ", incluye sistema" : ""
      })\n${JSON.stringify(rows, null, 2)}`
    );
  } catch (err) {
    return errorResult(err);
  }
}
