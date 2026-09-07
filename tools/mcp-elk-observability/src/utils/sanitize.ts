/**
 * Field (key) names redacted unconditionally, regardless of nesting depth or
 * where in the document tree they appear (FR-19). Matching is
 * case-insensitive on the key itself, never on the dot-path, so
 * `http.request.headers.Authorization` and `http.response.headers["Set-Cookie"]`
 * are both caught by the same simple rule.
 */
const DEFAULT_SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "body",
  "querystring",
  "query_string",
]);

const REDACTED = "[REDACTED]";

/**
 * Defense-in-depth: no field is ever allowed to disclose an API key value,
 * regardless of what the surrounding key is literally called
 * (`apiKey`, `api_key`, `elasticsearchApiKey`, `X-Api-Key`, ...). Normalizing
 * away `_`/`-` and casing before checking for the `apikey` substring makes
 * this independent of naming convention.
 */
function looksLikeApiKeyField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return normalized.includes("apikey");
}

function isSensitiveKey(key: string, extraPaths: ReadonlySet<string>, dotPath: string): boolean {
  const lowerKey = key.toLowerCase();
  return (
    DEFAULT_SENSITIVE_KEYS.has(lowerKey) ||
    looksLikeApiKeyField(key) ||
    extraPaths.has(dotPath) ||
    extraPaths.has(lowerKey)
  );
}

function redact(value: unknown, path: readonly string[], extraPaths: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, path, extraPaths));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const currentPath = [...path, key];
      const dotPath = currentPath.join(".").toLowerCase();
      if (isSensitiveKey(key, extraPaths, dotPath)) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = redact(val, currentPath, extraPaths);
    }
    return result;
  }

  return value;
}

/**
 * Centralized, single-enforcement-point document sanitizer (FR-19).
 *
 * Default-off disclosure: `Authorization`, `Cookie`, `Set-Cookie` headers and
 * request/response bodies/query strings are stripped unconditionally, with
 * no toggle to re-enable them. An optional `extraSensitiveFields` list of
 * dot-paths (typically sourced from `config/env.ts`'s `EXTRA_SENSITIVE_FIELDS`)
 * adds deployment-specific redactions on top of the built-in defaults.
 *
 * Always returns a new value — the input is never mutated, so a caller
 * cannot accidentally leak the original object by holding a reference to
 * part of it.
 */
export function sanitizeDocument(doc: unknown, extraSensitiveFields: string[] = []): unknown {
  const extraPaths = new Set(extraSensitiveFields.map((field) => field.toLowerCase()));
  return redact(doc, [], extraPaths);
}
