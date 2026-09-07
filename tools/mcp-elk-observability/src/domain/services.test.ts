import { describe, expect, it } from "vitest";
import { listServices } from "./services.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import transactions from "../../test/fixtures/transactions.json";

const TRACE_INDEX = "traces-apm-default";

describe("listServices", () => {
  it("discovers services dynamically via aggregation, sorted by transaction volume descending", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listServices(client, {}, TRACE_INDEX);

    expect(result.services.length).toBeGreaterThan(0);
    const names = result.services.map((s) => s.name);
    expect(names).toContain("PuntoVentaAPI");
    expect(names).toContain("FinanzasAPI");
    expect(names).toContain("ContabilidadAPI");

    for (let i = 1; i < result.services.length; i++) {
      expect(result.services[i - 1]!.transactions).toBeGreaterThanOrEqual(
        result.services[i]!.transactions,
      );
    }
  });

  it("does not add an environment filter when environment is omitted (FR-14)", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listServices(client, {}, TRACE_INDEX);
    // tx-no-environment has no service.environment field at all; it must still be counted.
    const contabilidad = result.services.find((s) => s.name === "ContabilidadAPI");
    expect(contabilidad?.transactions).toBe(1);
    expect(result).not.toHaveProperty("environment");
  });

  it("echoes environment in the response only when supplied in the request", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listServices(client, { environment: "produccion" }, TRACE_INDEX);
    expect(result.environment).toBe("produccion");
  });

  it("defaults period to 1h and echoes it in the response", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listServices(client, {}, TRACE_INDEX);
    expect(result.period).toBe("1h");
  });

  it("never hardcodes or classifies a service name (FR-1) - accepts any fixture-discovered name verbatim", async () => {
    const client = fakeSearchClientFromDocs(transactions as Record<string, unknown>[]);
    const result = await listServices(client, {}, TRACE_INDEX);
    const finanzas = result.services.find((s) => s.name === "FinanzasAPI");
    expect(finanzas).toBeDefined();
  });
});
