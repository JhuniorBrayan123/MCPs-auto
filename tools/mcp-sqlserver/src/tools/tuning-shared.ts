import { permissionErrorMessage } from "../sql/tuning.js";
import { errorResult, type McpToolResponse } from "./shared.js";

export const VIEW_SERVER_STATE = "VIEW SERVER STATE (en SQL Server 2022+ basta VIEW SERVER PERFORMANCE STATE)";

/** Error de una tool de tuning: mensaje de permiso claro si aplica, si no el error normal. */
export function tuningErrorResult(err: unknown, requiredPermission: string): McpToolResponse {
  const message = permissionErrorMessage(err, requiredPermission);
  if (message === null) return errorResult(err);
  return { content: [{ type: "text", text: message }], isError: true };
}
