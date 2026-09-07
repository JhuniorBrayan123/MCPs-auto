import type { SearchClientLike } from "../elastic/search.js";
import { sanitizeDocument } from "../utils/sanitize.js";
import { toErrorEnvelope, type ErrorEnvelope } from "../utils/errors.js";

/**
 * Runtime dependencies every tool module needs to execute: an injected
 * search client (real `@elastic/elasticsearch` client in production, a
 * fake in tests) plus the configured index names and extra-sensitive-field
 * list from `config/env.ts`.
 */
export interface ToolDeps {
  client: SearchClientLike;
  traceIndex: string;
  errorIndex: string;
  extraSensitiveFields?: string[];
}

/**
 * Thin execution wrapper shared by every tool module (design.md's
 * `tools/` layer: zod validate -> domain call -> response shaping /
 * sanitization). Callers are expected to have already run `schema.parse()`
 * on the raw input *before* calling this (so a validation failure throws,
 * as a client/protocol-level error) — `fn` here performs only the
 * already-validated domain call.
 *
 * Any error `fn` throws (`SearchError`, `DomainError`, `InvalidPeriodError`)
 * is converted to the response envelope shape from specification.md rather
 * than propagating as an exception, so every tool has one uniform
 * success-or-error-envelope return contract.
 *
 * The successful result is always passed through `sanitizeDocument()`
 * before being returned (FR-19) — per tasks.md, no tool bypasses
 * sanitization, even for shapes that look unlikely to carry sensitive
 * nested content.
 */
export async function runTool<T>(
  deps: ToolDeps,
  fn: () => Promise<T>,
): Promise<T | ErrorEnvelope> {
  try {
    const result = await fn();
    return sanitizeDocument(result, deps.extraSensitiveFields ?? []) as T;
  } catch (err) {
    return toErrorEnvelope(err);
  }
}
