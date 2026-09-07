import { listEndpointsSchema } from "../schemas/discovery.js";
import { listEndpoints, type ListEndpointsResult } from "../domain/endpoints.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "list_endpoints";
export const description =
  "Lists distinct endpoints (grouped by transaction.name, never url.path) for a given " +
  "service within a period, with request counts, HTTP method, and a sample path.";
export const inputSchema = listEndpointsSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ListEndpointsResult | ErrorEnvelope> {
  const parsed = listEndpointsSchema.parse(rawInput);
  return runTool(deps, () =>
    listEndpoints(
      deps.client,
      {
        service: parsed.service,
        environment: parsed.environment,
        period: parsed.period,
        limit: parsed.limit,
        includeOptions: parsed.include_options,
      },
      deps.traceIndex,
    ),
  );
}
