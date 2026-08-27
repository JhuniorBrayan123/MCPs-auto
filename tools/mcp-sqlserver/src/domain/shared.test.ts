import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateIdlogFloor, SAMPLE_ROWS } from "./shared.js";
import type { SqlQuerySpec, SqlQueryResult, SqlSearchClientLike } from "../sql/search.js";

/**
 * Fake `SqlSearchClientLike` that answers `estimateIdlogFloor`'s two
 * sequential queries (MAX(idlog), then the recent sample) by inspecting the
 * query text — same "inject a fake at the domain seam" pattern as
 * `mcp-elk-observability`'s domain tests inject a fake `SearchClientLike`.
 */
function fakeClient(params: { maxId: string | null; minfecha: Date | null; filas: number }): SqlSearchClientLike {
  return {
    async query<T>(spec: SqlQuerySpec): Promise<SqlQueryResult<T>> {
      if (spec.text.includes("MAX(idlog)")) {
        return { recordset: [{ maxid: params.maxId }] as unknown as T[] };
      }
      if (spec.text.includes("MIN(fecha)")) {
        return { recordset: [{ minfecha: params.minfecha, filas: params.filas }] as unknown as T[] };
      }
      throw new Error(`unexpected query in test fake: ${spec.text}`);
    },
    async queryMany<T>(specs: SqlQuerySpec[]): Promise<Array<SqlQueryResult<T>>> {
      return Promise.all(specs.map((spec) => this.query<T>(spec)));
    },
  };
}

describe("estimateIdlogFloor", () => {
  it("returns '0' when the table has no rows at all", async () => {
    const client = fakeClient({ maxId: null, minfecha: null, filas: 0 });
    assert.equal(await estimateIdlogFloor(client, 1), "0");
  });

  it("returns '0' when the sample window has no rows", async () => {
    const client = fakeClient({ maxId: "1000000", minfecha: null, filas: 0 });
    assert.equal(await estimateIdlogFloor(client, 1), "0");
  });

  it("floors idlog using sampled rows/day * dias * SAFETY_FACTOR", async () => {
    // Sample: 24,000 rows arrived over exactly 1 day -> 24,000 rows/day.
    // dias=2 -> estimatedRows = ceil(24000 * 2 * 3) = 144000.
    // floor = 1,000,000 - 144,000 = 856,000.
    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const client = fakeClient({ maxId: "1000000", minfecha: oneDayAgo, filas: 24_000 });

    const floor = await estimateIdlogFloor(client, 2);

    assert.equal(floor, "856000");
  });

  it("never returns a negative floor even when the estimate exceeds maxId", async () => {
    // Huge rows/day * huge dias would drive the floor below 0; it must clamp to 0.
    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const client = fakeClient({ maxId: "1000", minfecha: oneDayAgo, filas: SAMPLE_ROWS });

    const floor = await estimateIdlogFloor(client, 90);

    assert.equal(floor, "0");
  });
});
