import { describe, expect, it, vi } from "vitest";
import { createElasticsearchClient } from "./client.js";

describe("createElasticsearchClient", () => {
  it("constructs the client using the configured Elasticsearch URL as node", () => {
    const factory = vi.fn(() => ({}) as any);
    createElasticsearchClient(
      {
        elasticsearchUrl: "https://example.es.region.cloud.es.io:443",
        elasticsearchApiKey: "super-secret-key-123",
      },
      factory,
    );

    expect(factory).toHaveBeenCalledTimes(1);
    const [options] = factory.mock.calls[0]!;
    expect(options.node).toBe("https://example.es.region.cloud.es.io:443");
  });

  it("configures auth.apiKey so the transport sends Authorization: ApiKey <key>", () => {
    const factory = vi.fn(() => ({}) as any);
    createElasticsearchClient(
      {
        elasticsearchUrl: "https://example.es.region.cloud.es.io:443",
        elasticsearchApiKey: "super-secret-key-123",
      },
      factory,
    );

    const [options] = factory.mock.calls[0]!;
    expect(options.auth).toEqual({ apiKey: "super-secret-key-123" });
  });

  it("returns the client instance produced by the factory", () => {
    const fakeClient = { marker: "fake-client" };
    const factory = vi.fn(() => fakeClient as any);
    const client = createElasticsearchClient(
      { elasticsearchUrl: "https://x", elasticsearchApiKey: "key" },
      factory,
    );
    expect(client).toBe(fakeClient);
  });

  it("never logs the API key value during construction", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const secretKey = "super-secret-key-123";
    // Use the real default factory (real @elastic/elasticsearch Client) to make
    // sure construction itself never logs the key, not just our wrapper code.
    createElasticsearchClient({
      elasticsearchUrl: "https://example.es.region.cloud.es.io:443",
      elasticsearchApiKey: secretKey,
    });

    const allCalls = [
      ...logSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...infoSpy.mock.calls,
    ];
    const allLoggedText = allCalls.flat().map(String).join(" ");
    expect(allLoggedText).not.toContain(secretKey);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
