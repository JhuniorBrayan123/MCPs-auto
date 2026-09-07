import { getEndpointErrorsSchema } from "../schemas/errors.js";
import { getEndpointErrors, type EndpointErrorsResult } from "../domain/errors.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_endpoint_errors";
export const description =
  "Returns error signals for a single endpoint over a period, including failed request " +
  "rate and the top error groupings observed for that endpoint.";
export const inputSchema = getEndpointErrorsSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<EndpointErrorsResult | ErrorEnvelope> {
  const parsed = getEndpointErrorsSchema.parse(rawInput);
  return runTool(deps, () =>
    getEndpointErrors(
      deps.client,
      {
        service: parsed.service,
        transaction: parsed.transaction,
        environment: parsed.environment,
        period: parsed.period,
      },
      deps.traceIndex,
      deps.errorIndex,
    ),
  );
}
