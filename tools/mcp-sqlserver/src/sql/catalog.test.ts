import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildListDatabasesSql,
  buildSchemaObjectsSql,
  buildSearchObjectsSql,
  isSystemDatabase,
  quoteDbName,
  resolveSchemaFilter,
  resolveSearchDatabases,
  toLikeContainsPattern,
} from "./catalog.js";

describe("quoteDbName", () => {
  it("encierra el nombre entre corchetes", () => {
    assert.equal(quoteDbName("Ventas"), "[Ventas]");
    assert.equal(quoteDbName("Mi Base-2"), "[Mi Base-2]");
  });

  it("duplica los corchetes de cierre", () => {
    assert.equal(quoteDbName("a]b"), "[a]]b]");
    assert.equal(quoteDbName("x]; DROP DATABASE y; --"), "[x]]; DROP DATABASE y; --]");
  });

  it("rechaza nombres vacíos, demasiado largos o con caracteres de control", () => {
    assert.throws(() => quoteDbName(""));
    assert.throws(() => quoteDbName("a".repeat(129)));
    assert.throws(() => quoteDbName("a\u0000b"));
    assert.throws(() => quoteDbName("a\nb"));
  });
});

describe("toLikeContainsPattern", () => {
  it("envuelve el texto con % y escapa comodines", () => {
    assert.equal(toLikeContainsPattern("cliente"), "%cliente%");
    assert.equal(toLikeContainsPattern("50%_x[y]\\z"), "%50\\%\\_x\\[y]\\\\z%");
  });
});

describe("resolveSchemaFilter", () => {
  it("usa dbo por defecto", () => {
    assert.equal(resolveSchemaFilter(undefined), "dbo");
    assert.equal(resolveSchemaFilter("ventas"), "ventas");
  });

  it("'*', vacío o allSchemas quitan el filtro", () => {
    assert.equal(resolveSchemaFilter("*"), null);
    assert.equal(resolveSchemaFilter(""), null);
    assert.equal(resolveSchemaFilter("dbo", true), null);
  });
});

describe("isSystemDatabase", () => {
  it("reconoce las bases de sistema sin distinguir mayúsculas", () => {
    assert.equal(isSystemDatabase("master"), true);
    assert.equal(isSystemDatabase("TempDB"), true);
    assert.equal(isSystemDatabase("Ventas"), false);
  });
});

describe("resolveSearchDatabases", () => {
  const accessible = ["master", "msdb", "Ventas", "Compras"];

  it("sin lista pedida devuelve las de usuario", () => {
    assert.deepEqual(resolveSearchDatabases(accessible), { databases: ["Ventas", "Compras"], rejected: [] });
  });

  it("con includeSystem devuelve todas", () => {
    assert.deepEqual(resolveSearchDatabases(accessible, [], true).databases, accessible);
  });

  it("valida la lista pedida contra sys.databases y devuelve el nombre canónico", () => {
    assert.deepEqual(resolveSearchDatabases(accessible, ["ventas", "Inexistente", "VENTAS", "x]--"]), {
      databases: ["Ventas"],
      rejected: ["Inexistente", "x]--"],
    });
  });

  it("permite pedir explícitamente una base de sistema accesible", () => {
    assert.deepEqual(resolveSearchDatabases(accessible, ["msdb"]).databases, ["msdb"]);
  });
});

describe("buildListDatabasesSql", () => {
  it("excluye bases de sistema por defecto", () => {
    const text = buildListDatabasesSql(false);
    assert.match(text, /FROM sys\.databases d/);
    assert.match(text, /HAS_DBACCESS\(d\.name\)/);
    assert.match(text, /WHERE d\.name NOT IN \(N'master', N'tempdb', N'model', N'msdb'\)/);
  });

  it("incluye bases de sistema si se pide", () => {
    assert.doesNotMatch(buildListDatabasesSql(true), /NOT IN/);
  });
});

describe("buildSearchObjectsSql", () => {
  it("usa nombres de tres partes escapados y parámetros para el texto", () => {
    const text = buildSearchObjectsSql("Ven]tas", false);
    assert.match(text, /FROM \[Ven\]\]tas\]\.sys\.objects o/);
    assert.match(text, /JOIN \[Ven\]\]tas\]\.sys\.schemas s/);
    assert.match(text, /o\.name LIKE @pattern ESCAPE '\\'/);
    assert.match(text, /SELECT TOP \(@limit\)/);
    assert.doesNotMatch(text, /sys\.columns/);
  });

  it("agrega la búsqueda por columnas con UNION ALL", () => {
    const text = buildSearchObjectsSql("Ventas", true);
    assert.match(text, /UNION ALL/);
    assert.match(text, /FROM \[Ventas\]\.sys\.columns c/);
    assert.match(text, /c\.name LIKE @pattern/);
  });

  it("rechaza nombres de base inválidos", () => {
    assert.throws(() => buildSearchObjectsSql("", false));
  });
});

describe("buildSchemaObjectsSql", () => {
  it("filtra por @schema cuando corresponde", () => {
    const q = buildSchemaObjectsSql(true);
    assert.match(q.tables, /TABLE_SCHEMA = @schema/);
    assert.match(q.views, /TABLE_SCHEMA = @schema/);
    assert.match(q.procedures, /s\.name = @schema/);
  });

  it("sin filtro no referencia @schema y califica procedimientos con su esquema", () => {
    const q = buildSchemaObjectsSql(false);
    for (const text of [q.tables, q.views, q.procedures]) {
      assert.doesNotMatch(text, /@schema/);
    }
    assert.match(q.procedures, /s\.name AS SCHEMA_NAME/);
  });
});
