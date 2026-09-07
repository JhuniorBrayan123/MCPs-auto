import { describe, expect, it } from "vitest";
import {
  DomainError,
  serviceNotFoundError,
  transactionNotFoundError,
  traceNotFoundError,
  toErrorEnvelope,
  SearchError,
  InvalidPeriodError,
} from "./errors.js";

describe("domain error factories", () => {
  it("serviceNotFoundError produces a SERVICE_NOT_FOUND DomainError", () => {
    const err = serviceNotFoundError("Typo123");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("SERVICE_NOT_FOUND");
    expect(err.message).toContain("Typo123");
  });

  it("transactionNotFoundError produces a TRANSACTION_NOT_FOUND DomainError", () => {
    const err = transactionNotFoundError("PuntoVentaAPI", "GET Nope");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("TRANSACTION_NOT_FOUND");
    expect(err.message).toContain("PuntoVentaAPI");
    expect(err.message).toContain("GET Nope");
  });

  it("traceNotFoundError produces a TRACE_NOT_FOUND DomainError", () => {
    const err = traceNotFoundError("bad-trace-id");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("TRACE_NOT_FOUND");
    expect(err.message).toContain("bad-trace-id");
  });
});

describe("re-exported client/transport taxonomy (source of truth stays in elastic/)", () => {
  it("re-exports SearchError from elastic/search.ts", () => {
    const err = new SearchError("AUTHENTICATION_ERROR", "denied");
    expect(err.code).toBe("AUTHENTICATION_ERROR");
  });

  it("re-exports InvalidPeriodError from elastic/period-parser.ts", () => {
    const err = new InvalidPeriodError("bogus");
    expect(err.code).toBe("INVALID_PERIOD");
  });
});

describe("toErrorEnvelope", () => {
  it("serializes a SearchError to the response envelope shape", () => {
    const err = new SearchError("INDEX_NOT_FOUND", "The target index does not exist.");
    expect(toErrorEnvelope(err)).toEqual({
      error: { code: "INDEX_NOT_FOUND", message: "The target index does not exist." },
    });
  });

  it("serializes a DomainError to the response envelope shape", () => {
    const err = serviceNotFoundError("Typo123");
    expect(toErrorEnvelope(err)).toEqual({
      error: { code: "SERVICE_NOT_FOUND", message: err.message },
    });
  });

  it("serializes an InvalidPeriodError to the response envelope shape", () => {
    const err = new InvalidPeriodError("1h; DROP");
    const envelope = toErrorEnvelope(err);
    expect(envelope.error.code).toBe("INVALID_PERIOD");
  });

  it("includes debug_detail only when the error carries one (DEBUG=true)", () => {
    const withDebug = new SearchError("ELASTICSEARCH_ERROR", "boom", "raw stack trace");
    expect(toErrorEnvelope(withDebug)).toEqual({
      error: { code: "ELASTICSEARCH_ERROR", message: "boom", debug_detail: "raw stack trace" },
    });
  });

  it("never includes a debug_detail key when the error has no debug detail", () => {
    const noDebug = new SearchError("ELASTICSEARCH_ERROR", "boom");
    const envelope = toErrorEnvelope(noDebug);
    expect(Object.hasOwn(envelope.error, "debug_detail")).toBe(false);
  });

  it("falls back to a generic ELASTICSEARCH_ERROR envelope for an untyped error", () => {
    const envelope = toErrorEnvelope(new Error("unexpected"));
    expect(envelope.error.code).toBe("ELASTICSEARCH_ERROR");
  });

  it("never leaks an API key value even through debug_detail", () => {
    const err = new SearchError("AUTHENTICATION_ERROR", "denied", "stack trace, no secrets here");
    const serialized = JSON.stringify(toErrorEnvelope(err));
    expect(serialized).not.toContain("super-secret-key");
  });
});
