import { getTraceDependenciesSchema } from "../schemas/traces.js";
import { getTraceDependencies, type TraceDependenciesResult } from "../domain/traces.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "get_trace_dependencies";
export const description =
  "Breaks down a trace's spans into dependency groups (type, subtype, destination) with " +
  "call counts and duration share of the trace. percentage_of_trace is never clamped; a " +
  "caveat field is always present to explain that.";
export const inputSchema = getTraceDependenciesSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<TraceDependenciesResult | ErrorEnvelope> {
  const parsed = getTraceDependenciesSchema.parse(rawInput);
  return runTool(deps, () =>
    getTraceDependencies(deps.client, { traceId: parsed.trace_id }, deps.traceIndex),
  );
}
