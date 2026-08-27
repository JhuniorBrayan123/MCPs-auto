/**
 * Typed error taxonomy for the SQLServer monitoring tools, mirroring the
 * pattern in `mcp-elk-observability/src/utils/errors.ts`: transport/client
 * errors are mapped at the `sql/search.ts` boundary, domain-level errors
 * (invalid input, "not found") are defined here.
 *
 * IMPORTANT: every error message below is copied byte-for-byte from the
 * original inline `monitoring-tools.ts` so the final tool response text
 * (formatted by `tools/shared.ts`'s `errorResult`) never changes — this
 * refactor adds a `code` for the taxonomy, it never changes what the user
 * sees.
 */

export type SqlErrorCode = "SQL_TIMEOUT" | "SQL_CONNECTION_ERROR" | "SQL_QUERY_ERROR";
export type DomainErrorCode = "INVALID_DATE_RANGE" | "LOG_NOT_FOUND";
export type ErrorCode = SqlErrorCode | DomainErrorCode;

/** Client/transport errors raised while talking to SQL Server (see `sql/search.ts::mapSqlError`). */
export class SqlError extends Error {
  readonly code: SqlErrorCode;
  readonly originalError?: unknown;

  constructor(code: SqlErrorCode, message: string, originalError?: unknown) {
    super(message);
    this.name = "SqlError";
    this.code = code;
    if (originalError !== undefined) {
      this.originalError = originalError;
    }
  }
}

/** Domain-level errors: bad input or a resource genuinely not found. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

/** Same message as the original `desde`/`hasta` validation in `erp_fallas_resumen` and `erp_fallas_rango`. */
export function invalidDateRangeError(): DomainError {
  return new DomainError(
    "INVALID_DATE_RANGE",
    "`desde`/`hasta` no son fechas válidas. Usa formato ISO, ej: '2026-08-25T10:00:00'."
  );
}

/** Same message as the original "no row" branch in `erp_falla_detalle`. */
export function logNotFoundError(idlog: number): DomainError {
  return new DomainError("LOG_NOT_FOUND", `No existe ninguna fila con idlog=${idlog}.`);
}
