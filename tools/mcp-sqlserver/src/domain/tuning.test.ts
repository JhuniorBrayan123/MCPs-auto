import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getBlocking, getIndexUsage, getMissingIndexes, getTopQueries } from "./tuning.js";
import type { SqlQuerySpec, SqlQueryResult, SqlSearchClientLike } from "../sql/search.js";

/**
 * Cliente falso: `route` decide qué devolver (o lanzar) según el texto de la
 * consulta. Registra cada consulta para inspeccionar texto y parámetros.
 */
function fakeClient(route: (spec: SqlQuerySpec) => unknown[] | Error): SqlSearchClientLike & { calls: SqlQuerySpec[] } {
  const calls: SqlQuerySpec[] = [];
  return {
    calls,
    async query<T>(spec: SqlQuerySpec): Promise<SqlQueryResult<T>> {
      calls.push(spec);
      const answer = route(spec);
      if (answer instanceof Error) throw answer;
      return { recordset: answer as T[] };
    },
    async queryMany<T>(specs: SqlQuerySpec[]): Promise<Array<SqlQueryResult<T>>> {
      return Promise.all(specs.map((spec) => this.query<T>(spec)));
    },
  };
}

const input = (spec: SqlQuerySpec, name: string) => spec.inputs?.find((i) => i.name === name)?.value;

const DATABASES = [
  { name: "master", database_id: 1 },
  { name: "Ventas", database_id: 5 },
];

describe("getMissingIndexes", () => {
  const missingRow = {
    database_name: "Ventas",
    table_name: "[Ventas].[dbo].[Pedido]",
    equality_columns: "[ClienteId]",
    inequality_columns: null,
    included_columns: "[Total]",
    user_seeks: 10,
    user_scans: 0,
    avg_total_user_cost: 1.5,
    avg_user_impact: 90,
    improvement_measure: 1350,
    last_user_seek: null,
  };

  it("sin filtro no consulta sys.databases y agrega la sugerencia como texto", async () => {
    const client = fakeClient(() => [missingRow]);
    const result = await getMissingIndexes(client, { limit: 25 });

    assert.equal(client.calls.length, 1);
    assert.equal(input(client.calls[0], "limit"), 25);
    assert.equal(input(client.calls[0], "dbid"), undefined);
    assert.equal(result.database, null);
    assert.match(result.rows[0].create_index_sugerido, /CREATE NONCLUSTERED INDEX \[IX_Pedido_ClienteId\]/);
  });

  it("con filtro valida el nombre y pasa el database_id como parámetro", async () => {
    const client = fakeClient((spec) => (spec.text.includes("FROM sys.databases") ? DATABASES : []));
    const result = await getMissingIndexes(client, { database: "ventas", limit: 10 });

    assert.equal(result.database, "Ventas");
    assert.equal(input(client.calls[1], "dbid"), 5);
    assert.doesNotMatch(client.calls[1].text, /ventas/i);
  });

  it("una base inexistente produce un error claro sin consultar las DMVs", async () => {
    const client = fakeClient(() => DATABASES);
    await assert.rejects(() => getMissingIndexes(client, { database: "NoExiste", limit: 10 }), /no existe en el servidor/);
    assert.equal(client.calls.length, 1);
  });
});

describe("getTopQueries", () => {
  it("usa la columna del whitelist y el límite como parámetro", async () => {
    const client = fakeClient((spec) => (spec.text.includes("FROM sys.databases") ? DATABASES : []));
    const result = await getTopQueries(client, { database: "Ventas", orderBy: "duration", limit: 20 });

    assert.equal(result.database, "Ventas");
    const main = client.calls[1];
    assert.match(main.text, /qs\.total_elapsed_time AS order_value/);
    assert.equal(input(main, "limit"), 20);
    assert.equal(input(main, "dbid"), 5);
  });

  it("propaga el error de permisos para que la tool lo traduzca", async () => {
    const denied = Object.assign(new Error("VIEW SERVER STATE permission was denied"), { number: 300 });
    const client = fakeClient(() => denied);
    await assert.rejects(() => getTopQueries(client, { orderBy: "cpu", limit: 5 }), /VIEW SERVER STATE/);
  });
});

describe("getIndexUsage", () => {
  it("valida la base contra las accesibles y consulta con su nombre canónico", async () => {
    const start = new Date("2026-09-01T08:00:00Z");
    const client = fakeClient((spec) => {
      if (spec.text.includes("HAS_DBACCESS")) return [{ name: "master" }, { name: "Ventas" }];
      if (spec.text.includes("dm_os_sys_info")) return [{ sqlserver_start_time: start }];
      return [{ index_name: "IX_A", sin_uso: true }];
    });
    const result = await getIndexUsage(client, { database: "VENTAS", onlyUnused: true, limit: 50 });

    assert.equal(result.database, "Ventas");
    assert.equal(result.serverStartTime, start);
    assert.equal(result.rows.length, 1);
    const main = client.calls[1];
    assert.match(main.text, /FROM \[Ventas\]\.sys\.indexes/);
    assert.equal(input(main, "db"), "Ventas");
    assert.equal(input(main, "limit"), 50);
  });

  it("rechaza bases no accesibles sin interpolar el texto del usuario", async () => {
    const client = fakeClient(() => [{ name: "Ventas" }]);
    await assert.rejects(
      () => getIndexUsage(client, { database: "x]; DROP DATABASE Ventas; --", onlyUnused: false, limit: 10 }),
      /no existe, no está ONLINE o el login no tiene acceso/
    );
    assert.equal(client.calls.length, 1);
  });
});

describe("getBlocking", () => {
  it("pasa el mínimo de ms y el límite como parámetros y devuelve bloqueadores inactivos", async () => {
    const client = fakeClient((spec) =>
      spec.text.includes("NOT EXISTS")
        ? [{ session_id: 60, open_transaction_count: 1 }]
        : [{ session_id: 70, blocking_session_id: 60 }]
    );
    const result = await getBlocking(client, { onlyBlocked: true, minElapsedMs: 5000, limit: 100 });

    assert.equal(result.requests.length, 1);
    assert.equal(result.idleBlockers[0].session_id, 60);
    assert.equal(input(client.calls[0], "minElapsedMs"), 5000);
    assert.equal(input(client.calls[0], "limit"), 100);
    assert.match(client.calls[0].text, /blocking_session_id <> 0/);
  });
});
