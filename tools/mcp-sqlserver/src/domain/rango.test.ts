import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRango } from "./rango.js";
import type { SqlQuerySpec, SqlQueryResult, SqlSearchClientLike } from "../sql/search.js";

/**
 * Fake client for `getRango`. `queryMany` must return `[conteo, detalle]` in
 * that exact order, matching `sql/query-builder.ts::buildRangoConteoQuery` /
 * `buildRangoDetalleQuery` call order in `domain/rango.ts`.
 */
function fakeClient(params: { total: number; filas: unknown[] }): SqlSearchClientLike {
  return {
    async query<T>(spec: SqlQuerySpec): Promise<SqlQueryResult<T>> {
      if (spec.text.includes("MAX(idlog)")) return { recordset: [{ maxid: "1000000" }] as unknown as T[] };
      if (spec.text.includes("MIN(fecha)")) {
        return { recordset: [{ minfecha: new Date(Date.now() - 86_400_000), filas: 1000 }] as unknown as T[] };
      }
      throw new Error(`unexpected single query in test fake: ${spec.text}`);
    },
    async queryMany<T>(specs: SqlQuerySpec[]): Promise<Array<SqlQueryResult<T>>> {
      assert.equal(specs.length, 2, "erp_fallas_rango must run count + detail in one grouped call");
      assert.match(specs[0]!.text, /COUNT\(\*\) AS total/);
      assert.match(specs[1]!.text, /TOP \(@limit\)/);
      return [
        { recordset: [{ total: params.total }] as unknown as T[] },
        { recordset: params.filas as T[] },
      ];
    },
  };
}

describe("getRango — total vs. limited detail (aviso de tope)", () => {
  it("returns the FULL count even when the detail rows are capped by `limit`", async () => {
    const filas = Array.from({ length: 50 }, (_, i) => ({ idlog: i }));
    const client = fakeClient({ total: 250, filas });

    const result = await getRango(client, {
      connection: "drt",
      fechaDesde: new Date(Date.now() - 86_400_000),
      fechaHasta: new Date(),
      limit: 50,
    });

    // erp_fallas_rango.ts triggers the "⚠️ Hay N filas en total..." aviso
    // exactly when total > limit — verify the domain layer surfaces the data
    // that decision needs: the true total, independent of the capped page.
    assert.equal(result.total, 250);
    assert.equal(result.filas.length, 50);
    assert.ok(result.total > result.limit, "total must exceed limit to trigger the aviso de tope");
  });

  it("does not need an aviso when total fits within `limit`", async () => {
    const filas = Array.from({ length: 5 }, (_, i) => ({ idlog: i }));
    const client = fakeClient({ total: 5, filas });

    const result = await getRango(client, {
      connection: "drt",
      fechaDesde: new Date(Date.now() - 86_400_000),
      fechaHasta: new Date(),
      limit: 50,
    });

    assert.equal(result.total, 5);
    assert.equal(result.filas.length, 5);
    assert.ok(result.total <= result.limit);
  });
});
