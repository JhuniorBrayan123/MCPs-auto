import { getServiceErrorsSchema } from "../schemas/errors.js";
import { getServiceErrors, type ServiceErrorsResult } from "../domain/errors.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_service_errors";
export const description =
  "Returns independent error signals for a service over a period: HTTP 4xx/5xx counts, " +
  "event.outcome breakdown, and APM error document count. No derived 'is this a real " +
  "failure' judgment is added.";
export const inputSchema = getServiceErrorsSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ServiceErrorsResult | ErrorEnvelope> {
  const parsed = getServiceErrorsSchema.parse(rawInput);
  return runTool(deps, () =>
    getServiceErrors(
      deps.client,
      {
        service: parsed.service,
        environment: parsed.environment,
        period: parsed.period,
      },
      deps.traceIndex,
      deps.errorIndex,
    ),
  );
}
