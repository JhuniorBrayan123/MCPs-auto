export interface EnvConfig {
  elasticsearchUrl: string;
  elasticsearchApiKey: string;
  apmTraceIndex: string;
  apmErrorIndex: string;
  extraSensitiveFields: string[];
  debug: boolean;
}

export class EnvValidationError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing required environment variable(s): ${missing.join(", ")}`);
    this.name = "EnvValidationError";
    this.missing = missing;
  }
}

const DEFAULT_APM_TRACE_INDEX = "traces-apm-default";
const DEFAULT_APM_ERROR_INDEX = "logs-apm.error-default";

type EnvSource = Record<string, string | undefined>;

function parseExtraSensitiveFields(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  return raw
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
}

function parseDebug(raw: string | undefined): boolean {
  return raw === "true";
}

export function loadEnv(env: EnvSource = process.env): EnvConfig {
  const missing: string[] = [];
  if (!env.ELASTICSEARCH_URL) {
    missing.push("ELASTICSEARCH_URL");
  }
  if (!env.ELASTICSEARCH_API_KEY) {
    missing.push("ELASTICSEARCH_API_KEY");
  }
  if (missing.length > 0) {
    throw new EnvValidationError(missing);
  }

  return {
    elasticsearchUrl: env.ELASTICSEARCH_URL as string,
    elasticsearchApiKey: env.ELASTICSEARCH_API_KEY as string,
    apmTraceIndex: env.APM_TRACE_INDEX?.trim() || DEFAULT_APM_TRACE_INDEX,
    apmErrorIndex: env.APM_ERROR_INDEX?.trim() || DEFAULT_APM_ERROR_INDEX,
    extraSensitiveFields: parseExtraSensitiveFields(env.EXTRA_SENSITIVE_FIELDS),
    debug: parseDebug(env.DEBUG),
  };
}
