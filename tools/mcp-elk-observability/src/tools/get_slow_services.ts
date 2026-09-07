import { getSlowServicesSchema } from "../schemas/health.js";
import { getSlowServices, type SlowServicesResult } from "../domain/health.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_slow_services";
export const description =
  "Ranks services by a requested latency percentile, descending, over a period.";
export const inputSchema = getSlowServicesSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<SlowServicesResult | ErrorEnvelope> {
  const parsed = getSlowServicesSchema.parse(rawInput);
  return runTool(deps, () =>
    getSlowServices(
      deps.client,
      {
        environment: parsed.environment,
        period: parsed.period,
        limit: parsed.limit,
        percentile: parsed.percentile,
      },
      deps.traceIndex,
    ),
  );
}
