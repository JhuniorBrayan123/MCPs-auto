import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAnomalias } from "./anomalias.js";
import type { SqlQuerySpec, SqlQueryResult, SqlSearchClientLike } from "../sql/search.js";

interface FakeAnomaliaRow {
  modulo: string;
  ubicacion: string;
  reciente: number;
  baseline: number;
  idlog_ejemplo: number | null;
}

function fakeClient(anomaliaRows: FakeAnomaliaRow[]): SqlSearchClientLike {
  return {
    async query<T>(spec: SqlQuerySpec): Promise<SqlQueryResult<T>> {
      // estimateIdlogFloor's two probes.
      if (spec.text.includes("MAX(idlog)")) return { recordset: [{ maxid: "1000000" }] as unknown as T[] };
      if (spec.text.includes("MIN(fecha)")) {
        return { recordset: [{ minfecha: new Date(Date.now() - 86_400_000), filas: 1000 }] as unknown as T[] };
      }
      // The anomalies aggregation itself.
      if (spec.text.includes("SUM(CASE WHEN")) return { recordset: anomaliaRows as unknown as T[] };
      throw new Error(`unexpected query in test fake: ${spec.text}`);
    },
    async queryMany<T>(specs: SqlQuerySpec[]): Promise<Array<SqlQueryResult<T>>> {
      return Promise.all(specs.map((spec) => this.query<T>(spec)));
    },
  };
}

describe("getAnomalias — NUEVO vs. baseline-backed anomalies", () => {
  it("marks a location with baseline=0 as NUEVO and ranks it above a scored anomaly", async () => {
    const client = fakeClient([
      // Existed before, but spiked far above what the baseline predicts.
      { modulo: "mscontabilidad", ubicacion: "Facturar()", reciente: 50, baseline: 70, idlog_ejemplo: 111 },
      // Never happened in the baseline window at all -> NUEVO.
      { modulo: "msventas", ubicacion: "Cobrar()", reciente: 3, baseline: 0, idlog_ejemplo: 222 },
    ]);

    const { anomalias } = await getAnomalias(client, {
      connection: "drt",
      horasRecientes: 24,
      diasBaseline: 7,
      limit: 15,
    });

    assert.equal(anomalias.length, 2);
    // NUEVO always sorts first (infinite score), regardless of insertion order.
    assert.equal(anomalias[0]?.ubicacion, "Cobrar()");
    assert.equal(anomalias[0]?.estado, "NUEVO — nunca había pasado en el baseline");
    assert.equal(anomalias[0]?.baseline_previo, 0);

    const scored = anomalias[1];
    assert.equal(scored?.ubicacion, "Facturar()");
    // tasaPorHora = 70 / (7*24) = 0.4167/h; esperado = 0.4167*24 = 10;
    // score = 50 / 10 = 5 -> "5x lo normal".
    assert.equal(scored?.esperado_normal, 10);
    assert.equal(scored?.estado, "5x lo normal");
  });

  it("respects `limit` after sorting by anomaly score", async () => {
    const client = fakeClient([
      { modulo: "m1", ubicacion: "A()", reciente: 10, baseline: 100, idlog_ejemplo: 1 }, // low score
      { modulo: "m2", ubicacion: "B()", reciente: 1, baseline: 0, idlog_ejemplo: 2 }, // NUEVO, highest
    ]);

    const { anomalias } = await getAnomalias(client, {
      connection: "drt",
      horasRecientes: 24,
      diasBaseline: 7,
      limit: 1,
    });

    assert.equal(anomalias.length, 1);
    assert.equal(anomalias[0]?.ubicacion, "B()");
  });
});
