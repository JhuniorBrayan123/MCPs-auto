import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertReadOnlyQuery, FORBIDDEN_KEYWORDS } from "./read-only-guard.js";

// Lista exacta esperada, ordenada igual que en read-only-guard.ts. Un archivo
// corrupto en disco (pasó una vez: "OPENDATASOURCE" -> "OPNDATASOURCE") pasa
// las pruebas por keyword individual si nadie prueba esa palabra específica,
// pero esta comparación estructural lo detecta sin depender de eso.
describe("FORBIDDEN_KEYWORDS — lista exacta, sin corrupción", () => {
  it("coincide byte a byte con la lista esperada", () => {
    assert.deepEqual(FORBIDDEN_KEYWORDS, [
      "INSERT",
      "UPDATE",
      "DELETE",
      "MERGE",
      "TRUNCATE",
      "DROP",
      "CREATE",
      "ALTER",
      "INTO",
      "GRANT",
      "REVOKE",
      "DENY",
      "EXEC",
      "EXECUTE",
      "BACKUP",
      "RESTORE",
      "SHUTDOWN",
      "RECONFIGURE",
      "KILL",
      "OPENROWSET",
      "OPENQUERY",
      "OPENDATASOURCE",
      "BULK",
      "WAITFOR",
    ]);
  });
});

describe("assertReadOnlyQuery — allows genuine read-only queries", () => {
  const allowed = [
    ["simple SELECT", "SELECT TOP 10 * FROM LOG"],
    ["lowercase", "select idmodulo, count(*) from log group by idmodulo"],
    ["CTE", "WITH t AS (SELECT 1 AS x) SELECT * FROM t"],
    ["table hint", "SELECT * FROM LOG WITH (NOLOCK)"],
    ["trailing semicolon", "SELECT 1;"],
    ["multiline", "SELECT idmodulo,\n       COUNT(*)\nFROM LOG\nGROUP BY idmodulo"],
    // These must NOT be false positives:
    ["keyword inside a string literal", "SELECT * FROM LOG WHERE mensaje LIKE '%DELETE%'"],
    ["keyword as bracketed identifier", "SELECT [DELETE] FROM T"],
    ["keyword as column prefix", "SELECT UPDATED_AT, CREATED_BY FROM T"],
    ["harmless comment", "-- resumen diario\nSELECT COUNT(*) FROM LOG"],
  ] as const;

  for (const [name, query] of allowed) {
    it(name, () => {
      assert.doesNotThrow(() => assertReadOnlyQuery(query));
    });
  }
});

describe("assertReadOnlyQuery — blocks every write path", () => {
  const blocked = [
    ["DELETE", "DELETE FROM LOG"],
    ["UPDATE", "UPDATE LOG SET mensaje = 'x'"],
    ["INSERT", "INSERT INTO LOG (mensaje) VALUES ('x')"],
    ["DROP", "DROP TABLE LOG"],
    ["TRUNCATE", "TRUNCATE TABLE LOG"],
    ["ALTER", "ALTER TABLE LOG ADD col INT"],
    ["MERGE", "MERGE INTO LOG USING x ON 1=1"],
    ["SELECT INTO (write disguised as a read)", "SELECT * INTO Copia FROM LOG"],
    ["stacked statement", "SELECT 1; DROP TABLE LOG"],
    ["statement hidden after a line comment", "SELECT 1 --nota\n; DELETE FROM LOG"],
    ["statement hidden in a block comment", "/* nota */ DELETE FROM LOG"],
    ["arbitrary execution", "EXEC sp_who"],
    ["external data access via OPENROWSET", "SELECT * FROM OPENROWSET('SQLNCLI','...','SELECT 1')"],
    ["external data access via OPENQUERY", "SELECT * FROM OPENQUERY(linkedserver, 'SELECT 1')"],
    ["external data access via OPENDATASOURCE", "SELECT * FROM OPENDATASOURCE('SQLNCLI', '...').db.dbo.t"],
    ["bulk import", "SELECT * FROM OPENROWSET(BULK 'C:\\file.csv', SINGLE_CLOB) AS x"],
    ["denial of service", "WAITFOR DELAY '23:59:59'"],
    ["permission change", "GRANT CONTROL ON DATABASE::prd TO qa"],
    ["empty query", "   "],
  ] as const;

  for (const [name, query] of blocked) {
    it(name, () => {
      assert.throws(() => assertReadOnlyQuery(query));
    });
  }
});
