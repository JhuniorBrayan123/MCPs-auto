import { toolAuthorization, type ToolAuthorizationMap } from "mcp-cognito-avp";

const query = toolAuthorization({ action: "query", resourceType: "ErpEnvironment", idArg: "connection" });
const introspect = toolAuthorization({
  action: "introspect",
  resourceType: "ErpEnvironment",
  idArg: "connection",
});
const view = toolAuthorization({ action: "view", resourceType: "ErpEnvironment", idArg: "connection" });

export const TOOL_AUTHORIZATION_MAP: ToolAuthorizationMap = {
  sqlserver_query: query,
  sqlserver_get_schema: introspect,
  sqlserver_test_connection: view,
  erp_fallas_resumen: view,
  erp_fallas_por_modulo: view,
  erp_falla_detalle: view,
  erp_anomalias: view,
  erp_fallas_rango: view,
};
