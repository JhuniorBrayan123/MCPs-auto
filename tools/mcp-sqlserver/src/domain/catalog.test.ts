import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listDatabases, searchObjects, type ObjectMatch } from "./catalog.js";
import type { SqlQuerySpec, SqlQueryResult, SqlSearchClientLike } from "../sql/search.js";

/**
 * Cliente falso: responde la lista de bases accesibles y, por base, las
 * coincidencias configuradas (o lanza el error configurado). Registra cada
 * consulta para poder inspeccionar texto y parámetros.
 */
function fakeClient(params: {
  accessible: string[];
  perDb: Record<string, ObjectMatch[] | Error>;
}): SqlSearchClientLike & { calls: SqlQuerySpec[] } {
  const calls: SqlQuerySpec[] = [];
  return {
    calls,
    async query<T>(spec: SqlQuerySpec): Promise<SqlQueryResult<T>> {
      calls.push(spec);
      if (spec.text.includes("state_desc = 'ONLINE'")) {
        return { recordset: params.accessible.map((name) => ({ name })) as unknown as T[] };
      }
      if (spec.text.includes("FROM sys.databases d")) {
        return { recordset: [{ name: "Ventas", has_access: true }] as unknown as T[] };
      }
      const db = spec.inputs?.find((i) => i.name === "db")?.value as string;
      const limit = spec.inputs?.find((i) => i.name === "limit")?.value as number;
      const answer = params.perDb[db];
      if (answer instanceof Error) throw answer;
      return { recordset: (answer ?? []).slice(0, limit) as unknown as T[] };
    },
    async queryMany<T>(specs: SqlQuerySpec[]): Promise<Array<SqlQueryResult<T>>> {
      return Promise.all(specs.map((spec) => this.query<T>(spec)));
    },
  };
}

function match(db: string, name: string): ObjectMatch {
  return { database_name: db, schema_name: "dbo", object_name: name, object_type: "USER_TABLE", column_name: null };
}

describe("listDatabases", () => {
  it("devuelve el recordset de sys.databases", async () => {
    const client = fakeClient({ accessible: [], perDb: {} });
    const rows = await listDatabases(client, false);
    assert.equal(rows.length, 1);
    assert.match(client.calls[0].text, /NOT IN/);
  });
});

describe("searchObjects", () => {
  it("recorre las bases de usuario accesibles y pasa el texto como parámetro", async () => {
    const client = fakeClient({
      accessible: ["master", "Compras", "Ventas"],
      perDb: { Compras: [match("Compras", "Cliente")], Ventas: [match("Ventas", "ClienteVenta")] },
    });
    const result = await searchObjects(client, { text: "cli%", includeColumns: false, includeSystem: false, limit: 200 });

    assert.deepEqual(result.searched, ["Compras", "Ventas"]);
    assert.equal(result.matches.length, 2);
    assert.deepEqual(result.skipped, []);
    assert.equal(result.truncated, false);

    const perDbCalls = client.calls.slice(1);
    assert.equal(perDbCalls.length, 2);
    for (const call of perDbCalls) {
      assert.doesNotMatch(call.text, /cli/);
      assert.equal(call.inputs?.find((i) => i.name === "pattern")?.value, "%cli\\%%");
    }
    assert.match(perDbCalls[0].text, /\[Compras\]\.sys\.objects/);
  });

  it("una base que falla se reporta y no aborta la búsqueda", async () => {
    const client = fakeClient({
      accessible: ["Compras", "Rota", "Ventas"],
      perDb: { Compras: [match("Compras", "A")], Rota: new Error("permiso denegado"), Ventas: [match("Ventas", "B")] },
    });
    const result = await searchObjects(client, { text: "x", includeColumns: true, includeSystem: false, limit: 200 });

    assert.deepEqual(result.searched, ["Compras", "Ventas"]);
    assert.deepEqual(result.skipped, [{ database: "Rota", reason: "permiso denegado" }]);
    assert.equal(result.matches.length, 2);
  });

  it("solo consulta las bases pedidas que existen y reporta las rechazadas", async () => {
    const client = fakeClient({ accessible: ["Compras", "Ventas"], perDb: { Ventas: [match("Ventas", "A")] } });
    const result = await searchObjects(client, {
      text: "a",
      databases: ["ventas", "NoExiste"],
      includeColumns: false,
      includeSystem: false,
      limit: 200,
    });

    assert.deepEqual(result.searched, ["Ventas"]);
    assert.deepEqual(result.rejected, ["NoExiste"]);
    assert.equal(client.calls.length, 2);
  });

  it("respeta el límite total entre bases y marca el corte", async () => {
    const client = fakeClient({
      accessible: ["A", "B", "C"],
      perDb: { A: [match("A", "1"), match("A", "2")], B: [match("B", "3"), match("B", "4")], C: [match("C", "5")] },
    });
    const result = await searchObjects(client, { text: "x", includeColumns: false, includeSystem: false, limit: 3 });

    assert.equal(result.matches.length, 3);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.searched, ["A", "B"]);
    assert.equal(client.calls[2].inputs?.find((i) => i.name === "limit")?.value, 1);
  });
});
