import { z } from "zod";
import {
  environmentParam,
  optionalTransactionParam,
  periodSchema,
  serviceParam,
} from "./shared.js";

/**
 * `compare_periods` — FR-13, FR-14, FR-16, FR-17. `current_period` and
 * `comparison_period` are both required and validated against the same
 * period enum, but neither carries a default (there is no sensible default
 * for "what to compare against").
 */
export const comparePeriodsSchema = z.object({
  service: serviceParam,
  transaction: optionalTransactionParam,
  environment: environmentParam,
  current_period: periodSchema,
  comparison_period: periodSchema,
});
