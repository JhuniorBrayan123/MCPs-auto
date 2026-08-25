/**
 * Read-only guard for the SQL Server MCP.
 *
 * This MCP is consumed by the QA team against production (`prd`), so the query
 * tool must never be able to mutate data. This module is the first of three
 * layers of protection:
 *
 *   1. This static guard (allowlist parse: SELECT/WITH only, single statement).
 *   2. A transaction that is always rolled back (see `index.ts`).
 *   3. A read-only SQL Server login (infrastructure — the only hard guarantee).
 *
 * Layer 3 is the real one. Layers 1 and 2 exist so that a misconfigured login
 * does not silently turn into a write path.
 */

/** Statements that must never reach the database through this MCP. */
export const FORBIDDEN_KEYWORDS = [
  // Data mutation
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "TRUNCATE",
  // Schema mutation
  "DROP",
  "CREATE",
  "ALTER",
  // `SELECT ... INTO destino` creates a table: it is a write wearing a SELECT.
  "INTO",
  // Permissions
  "GRANT",
  "REVOKE",
  "DENY",
  // Arbitrary execution
  "EXEC",
  "EXECUTE",
  // Server-level operations
  "BACKUP",
  "RESTORE",
  "SHUTDOWN",
  "RECONFIGURE",
  "KILL",
  // External data access / bulk paths
  "OPENROWSET",
  "OPENQUERY",
  "OPENDATASOURCE",
  "BULK",
  // Denial of service (`WAITFOR DELAY '23:59:59'` would pin a connection)
  "WAITFOR",
];

/**
 * Strips everything that could hide a keyword from the analysis: comments,
 * string literals and quoted identifiers.
 *
 * Removing string literals and identifiers is what prevents false positives on
 * legitimate queries such as `WHERE mensaje LIKE '%DELETE%'` or a column
 * literally named `[DELETE]`.
 */
export function sanitizeForAnalysis(query: string): string {
  return query
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* block comments */
    .replace(/--[^\n\r]*/g, " ") // -- line comments
    .replace(/'(?:[^']|'')*'/g, " 'literal' ") // 'string literals'
    .replace(/\[[^\]]*\]/g, " identifier ") // [bracketed identifiers]
    .replace(/"[^"]*"/g, " identifier ") // "quoted identifiers"
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Throws when `query` is anything other than a single read-only statement.
 * Returns silently when the query is safe to execute.
 */
export function assertReadOnlyQuery(query: string): void {
  const analyzed = sanitizeForAnalysis(query);

  if (!analyzed) {
    throw new Error("La query está vacía.");
  }

  const statements = analyzed
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  if (statements.length > 1) {
    throw new Error(
      "Solo se permite una sentencia por llamada; se detectó más de una separada por ';'."
    );
  }

  const statement = statements[0];

  if (!/^(SELECT|WITH)\b/i.test(statement)) {
    throw new Error(
      "Este MCP es de solo lectura: la sentencia debe empezar con SELECT o WITH."
    );
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(statement)) {
      throw new Error(
        `Este MCP es de solo lectura: la query contiene la operación no permitida '${keyword}'.`
      );
    }
  }
}
