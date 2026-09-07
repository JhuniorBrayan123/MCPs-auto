import { getEndpointLatencySchema } from "../schemas/health.js";
import { getEndpointLatency, type EndpointLatencyResult } from "../domain/endpoints.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_endpoint_latency";
export const description =
  "Returns the full latency percentile set (avg, p50, p75, p90, p95, p99, max, all in " +
  "milliseconds) for a single endpoint over a period.";
export const inputSchema = getEndpointLatencySchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<EndpointLatencyResult | ErrorEnvelope> {
  const parsed = getEndpointLatencySchema.parse(rawInput);
  return runTool(deps, () =>
    getEndpointLatency(
      deps.client,
      {
        service: parsed.service,
        transaction: parsed.transaction,
        environment: parsed.environment,
        period: parsed.period,
      },
      deps.traceIndex,
    ),
  );
}
