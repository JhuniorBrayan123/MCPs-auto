import { errors as esErrors, type estypes } from "@elastic/elasticsearch";

/**
 * The subset of the ES client's taxonomy relevant at the elastic/search.ts
 * boundary. Domain-level codes (SERVICE_NOT_FOUND, TRANSACTION_NOT_FOUND,
 * TRACE_NOT_FOUND, INVALID_PERIOD) are not client/transport errors and are
 * mapped by the domain layer, not here.
 */
export type SearchErrorCode =
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "INDEX_NOT_FOUND"
  | "ELASTICSEARCH_TIMEOUT"
  | "ELASTICSEARCH_ERROR";

export class SearchError extends Error {
  readonly code: SearchErrorCode;
  readonly debugDetail?: string;

  constructor(code: SearchErrorCode, message: string, debugDetail?: string) {
    super(message);
    this.name = "SearchError";
    this.code = code;
    if (debugDetail !== undefined) {
      this.debugDetail = debugDetail;
    }
  }
}

export interface SearchClientLike {
  search<TDocument = unknown>(
    request: estypes.SearchRequest,
  ): Promise<estypes.SearchResponse<TDocument>>;
}

export interface SearchOptions {
  /** When true, attaches stack/message detail to SearchError.debugDetail. Never includes credentials. */
  debug?: boolean;
}

function isIndexNotFoundError(err: InstanceType<typeof esErrors.ResponseError>): boolean {
  const body = err.body as { error?: { type?: string } } | undefined;
  return body?.error?.type === "index_not_found_exception";
}

function debugDetailFor(err: unknown, debug: boolean): string | undefined {
  if (!debug) {
    return undefined;
  }
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

/**
 * Maps any error thrown by the `@elastic/elasticsearch` client to the exact
 * typed taxonomy codes from specification.md. Raw stack traces are attached
 * to `debugDetail` only when `debug` is explicitly true (FR-21).
 */
export function mapSearchError(err: unknown, debug = false): SearchError {
  const debugDetail = debugDetailFor(err, debug);

  if (err instanceof esErrors.ResponseError) {
    const statusCode = err.statusCode;
    if (statusCode === 401) {
      return new SearchError(
        "AUTHENTICATION_ERROR",
        "Elasticsearch rejected the provided API key.",
        debugDetail,
      );
    }
    if (statusCode === 403) {
      return new SearchError(
        "AUTHORIZATION_ERROR",
        "The API key lacks the privileges required for this request.",
        debugDetail,
      );
    }
    if (statusCode === 404 && isIndexNotFoundError(err)) {
      return new SearchError(
        "INDEX_NOT_FOUND",
        "The target index or data stream does not exist.",
        debugDetail,
      );
    }
    return new SearchError(
      "ELASTICSEARCH_ERROR",
      "Elasticsearch returned an unexpected error.",
      debugDetail,
    );
  }

  if (err instanceof esErrors.TimeoutError) {
    return new SearchError(
      "ELASTICSEARCH_TIMEOUT",
      "The Elasticsearch request timed out.",
      debugDetail,
    );
  }

  return new SearchError(
    "ELASTICSEARCH_ERROR",
    "Elasticsearch returned an unexpected error.",
    debugDetail,
  );
}

/**
 * Thin, error-mapped wrapper around `client.search`. Never rethrows the raw
 * client/transport error — always maps it to a `SearchError` from the typed
 * taxonomy above before it can propagate to callers.
 */
export async function search<TDocument = unknown>(
  client: SearchClientLike,
  request: estypes.SearchRequest,
  options: SearchOptions = {},
): Promise<estypes.SearchResponse<TDocument>> {
  try {
    return await client.search<TDocument>(request);
  } catch (err) {
    throw mapSearchError(err, options.debug ?? false);
  }
}
