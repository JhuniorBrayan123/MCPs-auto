import { getServiceHealthSchema } from "../schemas/health.js";
import { getServiceHealth, type ServiceHealthResult } from "../domain/health.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_service_health";
export const description =
  "Returns objective health metrics (requests, throughput, latency percentiles, error " +
  "counts, status code breakdown) for a service over a period. No healthy/degraded/" +
  "critical classification is computed — only measured values.";
export const inputSchema = getServiceHealthSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ServiceHealthResult | ErrorEnvelope> {
  const parsed = getServiceHealthSchema.parse(rawInput);
  return runTool(deps, () =>
    getServiceHealth(
      deps.client,
      {
        service: parsed.service,
        environment: parsed.environment,
        period: parsed.period,
        includeOptions: parsed.include_options,
      },
      deps.traceIndex,
    ),
  );
}
