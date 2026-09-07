import { getEndpointHealthSchema } from "../schemas/health.js";
import { getEndpointHealth, type EndpointHealthResult } from "../domain/health.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_endpoint_health";
export const description =
  "Same objective health metrics as get_service_health, scoped to a single endpoint " +
  "(service + transaction).";
export const inputSchema = getEndpointHealthSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<EndpointHealthResult | ErrorEnvelope> {
  const parsed = getEndpointHealthSchema.parse(rawInput);
  return runTool(deps, () =>
    getEndpointHealth(
      deps.client,
      {
        service: parsed.service,
        transaction: parsed.transaction,
        environment: parsed.environment,
        period: parsed.period,
        includeOptions: parsed.include_options,
      },
      deps.traceIndex,
    ),
  );
}
