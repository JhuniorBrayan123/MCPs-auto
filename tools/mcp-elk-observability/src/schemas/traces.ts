import { z } from "zod";
import { traceIdParam } from "./shared.js";

/** `trace_request` — FR-11, FR-16. */
export const traceRequestSchema = z.object({
  trace_id: traceIdParam,
});

/** `get_trace_dependencies` — FR-12, FR-16. */
export const getTraceDependenciesSchema = z.object({
  trace_id: traceIdParam,
});
