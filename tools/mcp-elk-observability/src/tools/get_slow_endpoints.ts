import { getSlowEndpointsSchema } from "../schemas/health.js";
import { getSlowEndpoints, type SlowEndpointsResult } from "../domain/health.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_slow_endpoints";
export const description =
  "Ranks endpoints within a service by a requested latency percentile, descending, over " +
  "a period. Always surfaces avg_ms/p95_ms/p99_ms regardless of the chosen percentile.";
export const inputSchema = getSlowEndpointsSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<SlowEndpointsResult | ErrorEnvelope> {
  const parsed = getSlowEndpointsSchema.parse(rawInput);
  return runTool(deps, () =>
    getSlowEndpoints(
      deps.client,
      {
        service: parsed.service,
        environment: parsed.environment,
        period: parsed.period,
        limit: parsed.limit,
        percentile: parsed.percentile,
        includeOptions: parsed.include_options,
      },
      deps.traceIndex,
    ),
  );
}
