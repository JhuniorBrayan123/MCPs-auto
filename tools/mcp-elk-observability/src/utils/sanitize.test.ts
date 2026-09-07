import { describe, expect, it } from "vitest";
import { sanitizeDocument } from "./sanitize.js";

describe("sanitizeDocument", () => {
  it("redacts an Authorization header regardless of nesting depth", () => {
    const doc = {
      http: { request: { headers: { Authorization: "Bearer secret-token" } } },
    };
    const result = sanitizeDocument(doc) as typeof doc;
    expect(result.http.request.headers.Authorization).toBe("[REDACTED]");
  });

  it("redacts Cookie and Set-Cookie headers case-insensitively", () => {
    const doc = {
      http: {
        request: { headers: { cookie: "session=abc123" } },
        response: { headers: { "Set-Cookie": "id=xyz; HttpOnly" } },
      },
    };
    const result = sanitizeDocument(doc) as typeof doc;
    expect(result.http.request.headers.cookie).toBe("[REDACTED]");
    expect(result.http.response.headers["Set-Cookie"]).toBe("[REDACTED]");
  });

  it("redacts request and response bodies by default", () => {
    const doc = {
      http: {
        request: { body: { original: "sensitive request payload" } },
        response: { body: { original: "sensitive response payload" } },
      },
    };
    const result = sanitizeDocument(doc) as typeof doc;
    expect(result.http.request.body).toBe("[REDACTED]");
    expect(result.http.response.body).toBe("[REDACTED]");
  });

  it("leaves non-sensitive fields untouched", () => {
    const doc = { service: { name: "PuntoVentaAPI" }, transaction: { name: "GET Foo" } };
    const result = sanitizeDocument(doc) as typeof doc;
    expect(result).toEqual(doc);
  });

  it("never mutates the input document (no shared references)", () => {
    const doc = { http: { request: { headers: { Authorization: "Bearer secret" } } } };
    const original = JSON.parse(JSON.stringify(doc));
    sanitizeDocument(doc);
    expect(doc).toEqual(original);
  });

  it("honors a configurable extra sensitive-field dot-path list", () => {
    const doc = { custom: { internalToken: "should-be-hidden" }, other: "kept" };
    const result = sanitizeDocument(doc, ["custom.internalToken"]) as typeof doc;
    expect(result.custom.internalToken).toBe("[REDACTED]");
    expect(result.other).toBe("kept");
  });

  it("does not redact anything extra when no extra sensitive fields are configured", () => {
    const doc = { custom: { internalToken: "visible-by-default" } };
    const result = sanitizeDocument(doc) as typeof doc;
    expect(result.custom.internalToken).toBe("visible-by-default");
  });

  it("never lets an API key value pass through under any key name", () => {
    const doc = {
      apiKey: "secret-key-1",
      api_key: "secret-key-2",
      elasticsearchApiKey: "secret-key-3",
      "X-Api-Key": "secret-key-4",
      unrelatedField: "kept-value",
    };
    const result = sanitizeDocument(doc) as Record<string, unknown>;
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.elasticsearchApiKey).toBe("[REDACTED]");
    expect(result["X-Api-Key"]).toBe("[REDACTED]");
    expect(result.unrelatedField).toBe("kept-value");
  });

  it("redacts sensitive fields inside arrays of documents", () => {
    const doc = {
      items: [
        { http: { request: { headers: { authorization: "Bearer a" } } } },
        { http: { request: { headers: { authorization: "Bearer b" } } } },
      ],
    };
    const result = sanitizeDocument(doc) as typeof doc;
    expect(result.items[0]?.http.request.headers.authorization).toBe("[REDACTED]");
    expect(result.items[1]?.http.request.headers.authorization).toBe("[REDACTED]");
  });

  it("passes through primitives and null unchanged", () => {
    expect(sanitizeDocument(null)).toBeNull();
    expect(sanitizeDocument(42)).toBe(42);
    expect(sanitizeDocument("plain string")).toBe("plain string");
  });
});
