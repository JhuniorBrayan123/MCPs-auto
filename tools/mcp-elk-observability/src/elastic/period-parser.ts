export const VALID_PERIODS = [
  "15m",
  "30m",
  "1h",
  "2h",
  "6h",
  "12h",
  "24h",
  "7d",
] as const;

export type ValidPeriod = (typeof VALID_PERIODS)[number];

const VALID_PERIOD_SET: ReadonlySet<string> = new Set(VALID_PERIODS);

export class InvalidPeriodError extends Error {
  readonly code = "INVALID_PERIOD" as const;

  constructor(received: unknown) {
    super(
      `Invalid period expression: ${JSON.stringify(
        received,
      )}. Expected one of: ${VALID_PERIODS.join(", ")}.`,
    );
    this.name = "InvalidPeriodError";
  }
}

/**
 * Strictly validates a period expression and translates it into an
 * Elasticsearch `@timestamp` range anchor of the form `now-{period}`.
 *
 * Only the exact allow-listed values in VALID_PERIODS are accepted. Any
 * other input — including adversarial/injection-style strings — is
 * rejected with InvalidPeriodError before it can reach the query layer.
 */
export function parsePeriod(period: string): string {
  if (typeof period !== "string" || !VALID_PERIOD_SET.has(period)) {
    throw new InvalidPeriodError(period);
  }
  return `now-${period}`;
}
