import { comparePeriodsSchema } from "../schemas/compare.js";
import { comparePeriods, type ComparePeriodsResult } from "../domain/compare.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "compare_periods";
export const description =
  "Compares key metrics (requests, throughput, latency percentiles, error rate) between " +
  "two periods for a service, or a single endpoint when transaction is provided.";
export const inputSchema = comparePeriodsSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ComparePeriodsResult | ErrorEnvelope> {
  const parsed = comparePeriodsSchema.parse(rawInput);
  return runTool(deps, () =>
    comparePeriods(
      deps.client,
      {
        service: parsed.service,
        transaction: parsed.transaction,
        environment: parsed.environment,
        currentPeriod: parsed.current_period,
        comparisonPeriod: parsed.comparison_period,
      },
      deps.traceIndex,
    ),
  );
}
