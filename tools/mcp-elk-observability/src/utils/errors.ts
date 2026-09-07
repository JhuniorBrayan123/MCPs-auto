/**
 * Centralizes the typed error taxonomy (FR-21) used across the app.
 *
 * The client/transport codes (`AUTHENTICATION_ERROR`, `AUTHORIZATION_ERROR`,
 * `INDEX_NOT_FOUND`, `ELASTICSEARCH_TIMEOUT`, `ELASTICSEARCH_ERROR`) and
 * `SearchError` already have their single source of truth in
 * `elastic/search.ts`, and `INVALID_PERIOD` / `InvalidPeriodError` in
 * `elastic/period-parser.ts` — this file does not redefine them, it
 * re-exports them so every other layer can import the full taxonomy from one
 * place. The three domain-level codes (`SERVICE_NOT_FOUND`,
 * `TRANSACTION_NOT_FOUND`, `TRACE_NOT_FOUND`) are not client/transport
 * errors and have no other home, so their `DomainError` class and factory
 * functions are genuinely defined here.
 */
import type { SearchErrorCode } from "../elastic/search.js";

export { SearchError, type SearchErrorCode } from "../elastic/search.js";
export { InvalidPeriodError } from "../elastic/period-parser.js";

export type DomainErrorCode = "SERVICE_NOT_FOUND" | "TRANSACTION_NOT_FOUND" | "TRACE_NOT_FOUND";

/** The complete typed taxonomy from specification.md's error table (FR-21). */
export type ErrorCode = SearchErrorCode | DomainErrorCode | "INVALID_PERIOD";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function serviceNotFoundError(service: string): DomainError {
  return new DomainError(
    "SERVICE_NOT_FOUND",
    `No service named '${service}' found in the given period.`,
  );
}

export function transactionNotFoundError(service: string, transaction: string): DomainError {
  return new DomainError(
    "TRANSACTION_NOT_FOUND",
    `No transaction named '${transaction}' found for service '${service}' in the given period.`,
  );
}

export function traceNotFoundError(traceId: string): DomainError {
  return new DomainError("TRACE_NOT_FOUND", `No documents found for trace_id '${traceId}'.`);
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    debug_detail?: string;
  };
}

interface TypedErrorShape {
  code: string;
  message: string;
  debugDetail?: string;
}

function isTypedError(err: unknown): err is TypedErrorShape {
  return (
    err instanceof Error &&
    typeof (err as { code?: unknown }).code === "string"
  );
}

/**
 * Serializes any typed error from the taxonomy (`SearchError`,
 * `InvalidPeriodError`, `DomainError`) to the exact response envelope shape
 * from specification.md. `debug_detail` is included only when the error
 * itself carries one (i.e. `DEBUG=true` was set when it was constructed) —
 * never added here, and never populated with anything the error didn't
 * already choose to expose, so an API key can never reach this envelope.
 */
export function toErrorEnvelope(err: unknown): ErrorEnvelope {
  if (isTypedError(err)) {
    const envelope: ErrorEnvelope = {
      error: { code: err.code as ErrorCode, message: err.message },
    };
    if (err.debugDetail !== undefined) {
      envelope.error.debug_detail = err.debugDetail;
    }
    return envelope;
  }

  return {
    error: {
      code: "ELASTICSEARCH_ERROR",
      message: "An unexpected error occurred.",
    },
  };
}
