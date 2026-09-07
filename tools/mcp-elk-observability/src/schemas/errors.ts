import { z } from "zod";
import {
  environmentParam,
  limitParam,
  optionalServiceParam,
  periodParam,
  serviceParam,
  transactionParam,
} from "./shared.js";

/** `get_service_errors` — FR-8, FR-14, FR-17. */
export const getServiceErrorsSchema = z.object({
  service: serviceParam,
  environment: environmentParam,
  period: periodParam(),
});

/** `get_endpoint_errors` — FR-9, FR-14, FR-17. */
export const getEndpointErrorsSchema = z.object({
  service: serviceParam,
  transaction: transactionParam,
  environment: environmentParam,
  period: periodParam(),
});

/** `get_top_errors` — FR-10, FR-14, FR-17, FR-20. `service` is optional: aggregates
 * across all services when omitted. Default limit 10. */
export const getTopErrorsSchema = z.object({
  service: optionalServiceParam,
  environment: environmentParam,
  period: periodParam(),
  limit: limitParam(10),
});
