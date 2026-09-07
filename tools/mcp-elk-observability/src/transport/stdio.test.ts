import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startStdioServer } from "./stdio.js";
import { EnvValidationError } from "../config/env.js";

describe("startStdioServer", () => {
  it("propagates EnvValidationError when required env vars are missing, before touching any transport", async () => {
    await expect(
      startStdioServer({ env: { ELASTICSEARCH_URL: "", ELASTICSEARCH_API_KEY: "" } }),
    ).rejects.toBeInstanceOf(EnvValidationError);
  });

  it("builds the client via the injected factory and connects the given transport, registering all 13 tools", async () => {
    const fakeEsClient = { search: vi.fn() };
    const clientFactory = vi.fn(() => fakeEsClient as never);
    const [serverSideTransport, clientSideTransport] = InMemoryTransport.createLinkedPair();

    const server = await startStdioServer({
      env: {
        ELASTICSEARCH_URL: "https://example.es.region.cloud.es.io:443",
        ELASTICSEARCH_API_KEY: "some-key",
      },
      clientFactory,
      transport: serverSideTransport,
    });

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(server.isConnected()).toBe(true);

    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientSideTransport);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(13);
  });
});
