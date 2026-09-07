import { traceRequestSchema } from "../schemas/traces.js";
import { traceRequest, type TraceRequestResult } from "../domain/traces.js";
import { runTool, type ToolDeps } from "./shared.js";
import type { ErrorEnvelope } from "../utils/errors.js";

export const name = "trace_request";
export const description =
  "Reconstructs a single distributed trace by trace_id: the root transaction plus all " +
  "spans, chronologically ordered. Returns TRACE_NOT_FOUND when no documents match.";
export const inputSchema = traceRequestSchema;

export async function execute(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<TraceRequestResult | ErrorEnvelope> {
  const parsed = traceRequestSchema.parse(rawInput);
  return runTool(deps, () =>
    traceRequest(deps.client, { traceId: parsed.trace_id }, deps.traceIndex),
  );
}
