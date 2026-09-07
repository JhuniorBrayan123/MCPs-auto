import { listServicesSchema } from "../schemas/discovery.js";
import { listServices, type ListServicesResult } from "../domain/services.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "list_services";
export const description =
  "Lists distinct services discovered dynamically via aggregation over the configured " +
  "period and optional environment filter, along with each service's transaction volume. " +
  "No service name is ever hardcoded or classified.";
export const inputSchema = listServicesSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ListServicesResult | ErrorEnvelope> {
  const params = listServicesSchema.parse(rawInput);
  return runTool(deps, () => listServices(deps.client, params, deps.traceIndex));
}
