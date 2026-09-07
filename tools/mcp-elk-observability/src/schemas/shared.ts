import { z } from "zod";
import { VALID_PERIODS } from "../elastic/period-parser.js";

/**
 * Shared Zod building blocks reused across every tool's input schema
 * (mirrors domain/shared.ts's role one layer up). Keeping these in one
 * place means every tool validates `period`/`limit`/`percentile` the same
 * way instead of each per-tool schema file reinventing the rule.
 */

/**
 * Validated against the exact same canonical value set as
 * `elastic/period-parser.ts`'s `parsePeriod` — reusing `VALID_PERIODS`
 * directly (rather than a second hardcoded literal list) is what "period
 * validated against the parser" means here: the schema layer and the
 * elastic layer can never drift apart on what counts as a valid period.
 */
export const periodSchema = z.enum(VALID_PERIODS);

/** Every tool that accepts `period` defaults it to `1h` per specification.md. */
export function periodParam() {
  return periodSchema.optional().default("1h");
}

/**
 * `environment` is free-form and NEVER defaulted (FR-14): omitting it from
 * the request must mean "no filter," never "apply some default value."
 */
export const environmentParam = z.string().optional();

export const includeOptionsParam = z.boolean().optional().default(false);

export const percentileSchema = z.union([
  z.literal(50),
  z.literal(75),
  z.literal(90),
  z.literal(95),
  z.literal(99),
]);

/** Defaults to `95` per specification.md for every tool exposing `percentile`. */
export function percentileParam() {
  return percentileSchema.optional().default(95);
}

/**
 * `limit` is capped at 100 server-side regardless of the value requested
 * (specification.md "Common conventions across all tools") — clamped, never
 * rejected, so a caller-requested 500 silently becomes 100 rather than
 * erroring. `defaultValue` is each tool's own documented default.
 */
export function limitParam(defaultValue: number, max = 100) {
  return z
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(defaultValue)
    .transform((value) => Math.min(value, max));
}

export const serviceParam = z.string();
export const optionalServiceParam = z.string().optional();
export const transactionParam = z.string();
export const optionalTransactionParam = z.string().optional();
export const traceIdParam = z.string();
