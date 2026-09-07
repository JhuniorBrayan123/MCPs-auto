import { z } from "zod";
import {
  environmentParam,
  includeOptionsParam,
  limitParam,
  periodParam,
  serviceParam,
} from "./shared.js";

/** `list_services` — FR-1, FR-14, FR-17, FR-20. No `limit` param is exposed. */
export const listServicesSchema = z.object({
  environment: environmentParam,
  period: periodParam(),
});

/** `list_endpoints` — FR-2, FR-14, FR-15, FR-17, FR-20. Default limit 20, max 100. */
export const listEndpointsSchema = z.object({
  service: serviceParam,
  environment: environmentParam,
  period: periodParam(),
  limit: limitParam(20),
  include_options: includeOptionsParam,
});
