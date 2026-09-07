import { describe, expect, it, vi } from "vitest";
import { errors as esErrors } from "@elastic/elasticsearch";
import { search, SearchError, type SearchClientLike } from "./search.js";

function fakeClient(searchImpl: (request: unknown) => Promise<unknown>): SearchClientLike {
  return { search: searchImpl as SearchClientLike["search"] };
}

describe("search", () => {
  it("returns the client response unchanged on success", async () => {
    const response = { hits: { hits: [] } };
    const client = fakeClient(async () => response);
    await expect(search(client, { index: "traces-apm-default" })).resolves.toBe(response);
  });

  it("maps a 401 ResponseError to AUTHENTICATION_ERROR", async () => {
    const client = fakeClient(async () => {
      throw new esErrors.ResponseError({
        statusCode: 401,
        body: { error: { type: "security_exception", reason: "unauthorized" } },
        meta: {} as never,
      } as never);
    });

    await expect(search(client, {})).rejects.toMatchObject({
      code: "AUTHENTICATION_ERROR",
    });
  });

  it("maps a 403 ResponseError to AUTHORIZATION_ERROR", async () => {
    const client = fakeClient(async () => {
      throw new esErrors.ResponseError({
        statusCode: 403,
        body: { error: { type: "security_exception", reason: "forbidden" } },
        meta: {} as never,
      } as never);
    });

    await expect(search(client, {})).rejects.toMatchObject({
      code: "AUTHORIZATION_ERROR",
    });
  });

  it("maps a 404 index_not_found_exception ResponseError to INDEX_NOT_FOUND", async () => {
    const client = fakeClient(async () => {
      throw new esErrors.ResponseError({
        statusCode: 404,
        body: { error: { type: "index_not_found_exception", reason: "no such index" } },
        meta: {} as never,
      } as never);
    });

    await expect(search(client, {})).rejects.toMatchObject({
      code: "INDEX_NOT_FOUND",
    });
  });

  it("maps a generic 5xx ResponseError to ELASTICSEARCH_ERROR", async () => {
    const client = fakeClient(async () => {
      throw new esErrors.ResponseError({
        statusCode: 500,
        body: { error: { type: "internal_server_error", reason: "boom" } },
        meta: {} as never,
      } as never);
    });

    await expect(search(client, {})).rejects.toMatchObject({
      code: "ELASTICSEARCH_ERROR",
    });
  });

  it("maps a TimeoutError to ELASTICSEARCH_TIMEOUT", async () => {
    const client = fakeClient(async () => {
      throw new esErrors.TimeoutError("Request timed out", {} as never);
    });

    await expect(search(client, {})).rejects.toMatchObject({
      code: "ELASTICSEARCH_TIMEOUT",
    });
  });

  it("maps any other unexpected error to ELASTICSEARCH_ERROR", async () => {
    const client = fakeClient(async () => {
      throw new Error("connection reset");
    });

    await expect(search(client, {})).rejects.toMatchObject({
      code: "ELASTICSEARCH_ERROR",
    });
  });

  it("does not attach debug_detail / stack info when debug is false (default)", async () => {
    const client = fakeClient(async () => {
      throw new Error("some internal detail with a stack trace");
    });

    try {
      await search(client, {});
      throw new Error("expected search to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(SearchError);
      expect((err as SearchError).debugDetail).toBeUndefined();
    }
  });

  it("attaches debugDetail only when debug is explicitly true", async () => {
    const client = fakeClient(async () => {
      throw new Error("some internal detail with a stack trace");
    });

    try {
      await search(client, {}, { debug: true });
      throw new Error("expected search to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(SearchError);
      expect((err as SearchError).debugDetail).toBeDefined();
      expect((err as SearchError).debugDetail).toContain("some internal detail");
    }
  });

  it("never includes an API key value in the mapped error even in debug mode", async () => {
    const apiKey = "super-secret-key-123";
    const client = fakeClient(async () => {
      throw new Error(`request failed`);
    });

    try {
      await search(client, {}, { debug: true });
      throw new Error("expected search to reject");
    } catch (err) {
      const serialized = JSON.stringify(err) + String((err as SearchError).debugDetail);
      expect(serialized).not.toContain(apiKey);
    }
  });
});
