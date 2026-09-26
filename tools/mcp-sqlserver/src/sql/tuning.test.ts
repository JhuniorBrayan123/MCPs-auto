import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TOP_QUERIES_ORDER_BY,
  TOP_QUERIES_ORDER_COLUMNS,
  buildBlockingSql,
  buildCreateIndexSuggestion,
  buildIndexUsageSql,
  buildMissingIndexesSql,
  buildTopQueriesSql,
  clampLimit,
  isPermissionError,
  permissionErrorMessage,
  resolveDatabaseByName,
  resolveTopQueriesOrderColumn,
} from "./tuning.js";
import { SqlError } from "../utils/errors.js";

describe("clampLimit", () => {
  it("recorta al rango [1, max] y trunca decimales", () => {
    assert.equal(clampLimit(20, 20, 200), 20);
    assert.equal(clampLimit(0, 20, 200), 1);
    assert.equal(clampLimit(-5, 20, 200), 1);
    assert.equal(clampLimit(999, 20, 200), 200);
    assert.equal(clampLimit(7.9, 20, 200), 7);
    assert.equal(clampLimit("15", 20, 200), 15);
  });

  it("usa el valor por defecto si no es numérico", () => {
    assert.equal(clampLimit(undefined, 20, 200), 20);
    assert.equal(clampLimit("abc", 25, 500), 25);
    assert.equal(clampLimit(NaN, 300, 200), 200);
  });
});

describe("resolveDatabaseByName", () => {
  const rows = [
    { name: "Ventas", database_id: 5 },
    { name: "SRExcepcion", database_id: 7 },
  ];

  it("encuentra la base sin distinguir mayúsculas y devuelve la fila canónica", () => {
    assert.deepEqual(resolveDatabaseByName(rows, "  srexcepcion "), { name: "SRExcepcion", database_id: 7 });
  });

  it("devuelve null para bases inexistentes o vacías", () => {
    assert.equal(resolveDatabaseByName(rows, "NoExiste"), null);
    assert.equal(resolveDatabaseByName(rows, "   "), null);
    assert.equal(resolveDatabaseByName(rows, "Ventas]; DROP DATABASE x; --"), null);
  });
});

describe("top queries: whitelist de ORDER BY", () => {
  it("cada criterio mapea a una columna fija de dm_exec_query_stats", () => {
    assert.deepEqual([...TOP_QUERIES_ORDER_BY], ["cpu", "duration", "reads", "writes", "executions"]);
    assert.equal(resolveTopQueriesOrderColumn("cpu"), "qs.total_worker_time");
    assert.equal(resolveTopQueriesOrderColumn("duration"), "qs.total_elapsed_time");
    assert.equal(resolveTopQueriesOrderColumn("reads"), "qs.total_logical_reads");
    assert.equal(resolveTopQueriesOrderColumn("writes"), "qs.total_logical_writes");
    assert.equal(resolveTopQueriesOrderColumn("executions"), "qs.execution_count");
    assert.ok(Object.isFrozen(TOP_QUERIES_ORDER_COLUMNS));
  });

  it("valores fuera del whitelist caen en cpu y nunca se interpolan", () => {
    const evil = "qs.total_worker_time; DROP TABLE x --";
    assert.equal(resolveTopQueriesOrderColumn(evil), "qs.total_worker_time");
    assert.equal(resolveTopQueriesOrderColumn("toString"), "qs.total_worker_time");
    assert.equal(resolveTopQueriesOrderColumn(undefined), "qs.total_worker_time");
    const text = buildTopQueriesSql(evil as never, false);
    assert.doesNotMatch(text, /DROP/);
    assert.match(text, /qs\.total_worker_time AS order_value/);
  });

  it("usa la columna pedida, TOP (@limit) y filtro opcional por @dbid", () => {
    const text = buildTopQueriesSql("reads", true);
    assert.match(text, /qs\.total_logical_reads AS order_value/);
    assert.match(text, /TOP \(@limit\)/);
    assert.match(text, /q\.dbid = @dbid/);
    assert.match(text, /LEFT\(SUBSTRING\(st\.text/);
    assert.match(text, /, 2000\)/);
    assert.doesNotMatch(buildTopQueriesSql("cpu", false), /@dbid/);
  });
});

describe("buildMissingIndexesSql", () => {
  it("lee las tres DMVs de índices faltantes y calcula improvement_measure", () => {
    const text = buildMissingIndexesSql(false);
    for (const dmv of ["dm_db_missing_index_group_stats", "dm_db_missing_index_groups", "dm_db_missing_index_details"]) {
      assert.match(text, new RegExp(dmv));
    }
    assert.match(text, /avg_total_user_cost \* migs\.avg_user_impact \* \(migs\.user_seeks \+ migs\.user_scans\)/);
    assert.match(text, /ORDER BY improvement_measure DESC/);
    assert.doesNotMatch(text, /@dbid/);
    assert.match(buildMissingIndexesSql(true), /WHERE mid\.database_id = @dbid/);
  });
});

describe("buildCreateIndexSuggestion", () => {
  it("arma CREATE INDEX con claves e INCLUDE, marcado como sugerencia", () => {
    const text = buildCreateIndexSuggestion({
      table_name: "[Ventas].[dbo].[Pedido]",
      equality_columns: "[ClienteId], [Estado]",
      inequality_columns: "[Fecha]",
      included_columns: "[Total]",
    });
    assert.match(text, /^-- SUGERENCIA para revisión del DBA \(NO se ejecuta\)/);
    assert.match(
      text,
      /CREATE NONCLUSTERED INDEX \[IX_Pedido_ClienteId_Estado_Fecha\] ON \[Ventas\]\.\[dbo\]\.\[Pedido\] \(\[ClienteId\], \[Estado\], \[Fecha\]\) INCLUDE \(\[Total\]\);$/
    );
  });

  it("omite INCLUDE cuando no hay columnas incluidas y sanea el nombre", () => {
    const text = buildCreateIndexSuggestion({
      table_name: "[Mi Base].[dbo].[Detalle Pedido]",
      equality_columns: null,
      inequality_columns: "[Fecha Alta]",
      included_columns: null,
    });
    assert.match(text, /\[IX_Detalle_Pedido_Fecha_Alta\] ON \[Mi Base\]\.\[dbo\]\.\[Detalle Pedido\] \(\[Fecha Alta\]\);$/);
    assert.doesNotMatch(text, /INCLUDE/);
  });

  it("limita el nombre del índice a 128 caracteres", () => {
    const long = Array.from({ length: 3 }, (_, i) => `[${"c".repeat(60)}${i}]`).join(", ");
    const text = buildCreateIndexSuggestion({
      table_name: `[db].[dbo].[${"t".repeat(60)}]`,
      equality_columns: long,
      inequality_columns: null,
      included_columns: null,
    });
    const name = text.match(/INDEX \[([^\]]+)\]/)?.[1] ?? "";
    assert.ok(name.length <= 128);
  });
});

describe("buildIndexUsageSql", () => {
  it("usa nombres de tres partes escapados y filtra usage_stats por DB_ID(@db)", () => {
    const text = buildIndexUsageSql("Mi]Base", false);
    assert.match(text, /FROM \[Mi\]\]Base\]\.sys\.indexes i/);
    assert.match(text, /\[Mi\]\]Base\]\.sys\.dm_db_partition_stats/);
    assert.match(text, /us\.database_id = DB_ID\(@db\)/);
    assert.match(text, /AS sin_uso/);
    assert.doesNotMatch(text, /\n  AND \(ISNULL/);
  });

  it("con onlyUnused filtra por la condición de 'sin uso' (excluye PK/UNIQUE)", () => {
    const text = buildIndexUsageSql("Ventas", true);
    assert.match(text, /\n  AND \(ISNULL\(us\.user_seeks, 0\)/);
    assert.match(text, /i\.is_primary_key = 0 AND i\.is_unique_constraint = 0/);
  });

  it("rechaza nombres de base inválidos", () => {
    assert.throws(() => buildIndexUsageSql("", false));
    assert.throws(() => buildIndexUsageSql("a\u0000b", false));
  });
});

describe("buildBlockingSql", () => {
  it("excluye la propia sesión y aplica el mínimo de ms como parámetro", () => {
    const text = buildBlockingSql(false);
    assert.match(text, /r\.session_id <> @@SPID/);
    assert.match(text, /r\.total_elapsed_time >= @minElapsedMs/);
    assert.match(text, /OUTER APPLY sys\.dm_exec_sql_text\(r\.sql_handle\)/);
    assert.doesNotMatch(text, /blocking_session_id <> 0/);
    assert.match(buildBlockingSql(true), /AND r\.blocking_session_id <> 0/);
  });
});

describe("clasificación de errores de permisos", () => {
  function requestError(number: number, message: string): Error {
    return Object.assign(new Error(message), { number });
  }

  it("reconoce los números 297/300 y el texto VIEW SERVER STATE", () => {
    assert.equal(isPermissionError(requestError(300, "VIEW SERVER STATE permission was denied on object 'server'")), true);
    assert.equal(isPermissionError(requestError(297, "The user does not have permission to perform this action.")), true);
    assert.equal(isPermissionError(new Error("VIEW DATABASE STATE permission denied in database 'X'")), true);
    assert.equal(isPermissionError(new Error("Timeout: Request failed to complete in 30000ms")), false);
  });

  it("mira el error original envuelto por SqlError", () => {
    const wrapped = new SqlError("SQL_QUERY_ERROR", "falló", requestError(300, "denied"));
    assert.equal(isPermissionError(wrapped), true);
    const nested = new SqlError("SQL_QUERY_ERROR", "falló", { originalError: { info: { number: 297 } } });
    assert.equal(isPermissionError(nested), true);
  });

  it("arma un mensaje en español con el permiso requerido, o null si no aplica", () => {
    const message = permissionErrorMessage(requestError(300, "VIEW SERVER STATE permission was denied"), "VIEW SERVER STATE");
    assert.ok(message);
    assert.match(message!, /Permiso insuficiente: el login necesita VIEW SERVER STATE/);
    assert.match(message!, /DBA/);
    assert.equal(permissionErrorMessage(new Error("Invalid object name 'x'"), "VIEW SERVER STATE"), null);
  });
});
