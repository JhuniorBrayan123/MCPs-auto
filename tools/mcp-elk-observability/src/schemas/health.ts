import { z } from "zod";
import {
  environmentParam,
  includeOptionsParam,
  limitParam,
  percentileParam,
  periodParam,
  serviceParam,
  transactionParam,
} from "./shared.js";

/** `get_service_health` — FR-3, FR-14, FR-15, FR-16, FR-17. */
export const getServiceHealthSchema = z.object({
  service: serviceParam,
  environment: environmentParam,
  period: periodParam(),
  include_options: includeOptionsParam,
});

/** `get_endpoint_health` — FR-4, FR-14, FR-15, FR-16, FR-17. */
export const getEndpointHealthSchema = z.object({
  service: serviceParam,
  transaction: transactionParam,
  environment: environmentParam,
  period: periodParam(),
  include_options: includeOptionsParam,
});

/** `get_endpoint_latency` — FR-5, FR-14, FR-16, FR-17. No `limit`/`percentile` params. */
export const getEndpointLatencySchema = z.object({
  service: serviceParam,
  transaction: transactionParam,
  environment: environmentParam,
  period: periodParam(),
});

/** `get_slow_services` — FR-6, FR-14, FR-15, FR-16, FR-17, FR-20. Default limit 10, percentile 95. */
export const getSlowServicesSchema = z.object({
  environment: environmentParam,
  period: periodParam(),
  limit: limitParam(10),
  percentile: percentileParam(),
});

/** `get_slow_endpoints` — FR-7, FR-14, FR-15, FR-16, FR-17, FR-20. */
export const getSlowEndpointsSchema = z.object({
  service: serviceParam,
  environment: environmentParam,
  period: periodParam(),
  limit: limitParam(10),
  percentile: percentileParam(),
  include_options: includeOptionsParam,
});
