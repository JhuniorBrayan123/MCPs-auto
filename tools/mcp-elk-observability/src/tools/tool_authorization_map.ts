import { toolAuthorization, type ToolAuthorizationMap } from "mcp-cognito-avp";

export const TOOL_AUTHORIZATION_MAP: ToolAuthorizationMap = {
  list_services: toolAuthorization({ action: "list", resourceType: "Service" }),
  list_endpoints: toolAuthorization({
    action: "list",
    resourceType: "Endpoint",
    projectArg: "service",
    parentType: "Service",
  }),
  get_service_health: toolAuthorization({ action: "view", resourceType: "Service", idArg: "service" }),
  get_endpoint_health: toolAuthorization({
    action: "view",
    resourceType: "Endpoint",
    idArg: "transaction",
    projectArg: "service",
    parentType: "Service",
  }),
  get_endpoint_latency: toolAuthorization({
    action: "view",
    resourceType: "Endpoint",
    idArg: "transaction",
    projectArg: "service",
    parentType: "Service",
  }),
  get_slow_services: toolAuthorization({ action: "list", resourceType: "Service" }),
  get_slow_endpoints: toolAuthorization({
    action: "list",
    resourceType: "Endpoint",
    projectArg: "service",
    parentType: "Service",
  }),
  get_service_errors: toolAuthorization({ action: "view", resourceType: "Service", idArg: "service" }),
  get_endpoint_errors: toolAuthorization({
    action: "view",
    resourceType: "Endpoint",
    idArg: "transaction",
    projectArg: "service",
    parentType: "Service",
  }),
  get_top_errors: toolAuthorization({ action: "list", resourceType: "Service" }),
  trace_request: toolAuthorization({ action: "view", resourceType: "Trace", idArg: "trace_id" }),
  get_trace_dependencies: toolAuthorization({ action: "view", resourceType: "Trace", idArg: "trace_id" }),
  compare_periods: toolAuthorization({ action: "compare", resourceType: "Service", idArg: "service" }),
};
