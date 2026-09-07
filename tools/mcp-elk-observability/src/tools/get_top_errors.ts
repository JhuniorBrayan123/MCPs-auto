import { getTopErrorsSchema } from "../schemas/errors.js";
import { getTopErrors, type TopErrorsResult } from "../domain/errors.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_top_errors";
export const description =
  "Returns the most frequent error groupings, optionally scoped to a service, over a " +
  "period. Each entry reports which candidate field path (grouping_field_used) resolved " +
  "the grouping, as a transparency diagnostic given the unverified APM_ERROR_INDEX mapping.";
export const inputSchema = getTopErrorsSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<TopErrorsResult | ErrorEnvelope> {
  const parsed = getTopErrorsSchema.parse(rawInput);
  return runTool(deps, () =>
    getTopErrors(
      deps.client,
      {
        service: parsed.service,
        environment: parsed.environment,
        period: parsed.period,
        limit: parsed.limit,
      },
      deps.errorIndex,
    ),
  );
}
