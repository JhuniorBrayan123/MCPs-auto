import { describe, expect, it } from "vitest";
import { compileFilters, type QuerySpec } from "./query-builder.js";

describe("compileFilters", () => {
  it("returns zero environment clauses when environment key is absent from spec", () => {
    const spec: QuerySpec = { service: "PuntoVentaAPI" };
    const clauses = compileFilters(spec);
    const environmentClauses = clauses.filter(
      (clause) =>
        "term" in clause &&
        clause.term !== undefined &&
        Object.prototype.hasOwnProperty.call(clause.term, "service.environment"),
    );
    expect(environmentClauses).toHaveLength(0);
  });

  it("flows spec.service into a term filter with zero transformation/classification", () => {
    const spec: QuerySpec = { service: "Qry-Facturacion-BE" };
    const clauses = compileFilters(spec);
    expect(clauses).toContainEqual({ term: { "service.name": "Qry-Facturacion-BE" } });
  });

  it("includes an environment clause when environment is present", () => {
    const spec: QuerySpec = { environment: "produccion" };
    const clauses = compileFilters(spec);
    expect(clauses).toContainEqual({ term: { "service.environment": "produccion" } });
  });

  it("includes a processor.event clause when processorEvent is present", () => {
    const spec: QuerySpec = { processorEvent: "span" };
    const clauses = compileFilters(spec);
    expect(clauses).toContainEqual({ term: { "processor.event": "span" } });
  });

  it("includes a transaction.name clause when transactionName is present", () => {
    const spec: QuerySpec = { transactionName: "GET Foo/Bar" };
    const clauses = compileFilters(spec);
    expect(clauses).toContainEqual({ term: { "transaction.name": "GET Foo/Bar" } });
  });

  it("includes an http.request.method clause when httpMethod is present", () => {
    const spec: QuerySpec = { httpMethod: "GET" };
    const clauses = compileFilters(spec);
    expect(clauses).toContainEqual({ term: { "http.request.method": "GET" } });
  });

  it("includes an @timestamp range clause when period is present", () => {
    const spec: QuerySpec = { period: "1h" };
    const clauses = compileFilters(spec);
    expect(clauses).toContainEqual({
      range: { "@timestamp": { gte: "now-1h", lte: "now" } },
    });
  });

  it("includes a trace.id clause when traceId is present", () => {
    const spec: QuerySpec = { traceId: "abc123" };
    const clauses = compileFilters(spec);
    expect(clauses).toContainEqual({ term: { "trace.id": "abc123" } });
  });

  it("always includes the OPTIONS-exclusion clause unless includeOptions is true", () => {
    const excluded = compileFilters({ service: "x" });
    expect(
      excluded.some(
        (clause) =>
          "bool" in clause &&
          JSON.stringify(clause).includes("OPTIONS"),
      ),
    ).toBe(true);

    const included = compileFilters({ service: "x", includeOptions: true });
    expect(
      included.some((clause) => JSON.stringify(clause).includes("OPTIONS")),
    ).toBe(false);
  });

  it("returns an empty array for a fully empty spec except the OPTIONS-exclusion default clause", () => {
    const clauses = compileFilters({});
    expect(clauses).toHaveLength(1);
    expect(JSON.stringify(clauses[0])).toContain("OPTIONS");
  });

  it("composes multiple dimensions together without cross-contamination", () => {
    const spec: QuerySpec = {
      service: "PuntoVentaAPI",
      transactionName: "GET Foo/Bar",
      period: "24h",
      includeOptions: true,
    };
    const clauses = compileFilters(spec);
    expect(clauses).toContainEqual({ term: { "service.name": "PuntoVentaAPI" } });
    expect(clauses).toContainEqual({ term: { "transaction.name": "GET Foo/Bar" } });
    expect(clauses).toContainEqual({
      range: { "@timestamp": { gte: "now-24h", lte: "now" } },
    });
    expect(clauses).not.toContainEqual({ term: { "service.environment": expect.anything() } });
    expect(clauses).toHaveLength(3);
  });
});
