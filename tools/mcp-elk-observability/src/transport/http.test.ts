import { describe, expect, it, vi, afterEach } from "vitest";
import type { Express } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const callOrder: string[] = [];

vi.mock("mcp-cognito-avp", async () => {
  const actual = await vi.importActual<typeof import("mcp-cognito-avp")>("mcp-cognito-avp");
  return {
    ...actual,
    buildCognitoAvpAuth: vi.fn(() => ({
      transport: "streamable-http",
      bearerAuthMiddleware: undefined,
      resourceMetadataUrl: undefined,
      cognitoOAuthProxyProvider: undefined,
      cognitoCallbackPath: "/oauth/cognito/callback",
      mountAuthRoutes: vi.fn(),
      applyAuthorization: vi.fn((server: unknown) => {
        callOrder.push("applyAuthorization");
        return server;
      }),
    })),
  };
});

function fakeExpressApp(): Express {
  return {
    use: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
    listen: vi.fn(),
  } as unknown as Express;
}

describe("startHttpServer", () => {
  afterEach(() => {
    callOrder.length = 0;
    vi.restoreAllMocks();
  });

  it("calls auth.applyAuthorization before any tool is registered", async () => {
    const registerToolSpy = vi.spyOn(McpServer.prototype, "registerTool").mockImplementation(function (
      this: unknown,
    ) {
      callOrder.push("registerTool");
      return undefined as never;
    });

    const { startHttpServer } = await import("./http.js");

    await startHttpServer({
      env: {
        ELASTICSEARCH_URL: "https://example.es.region.cloud.es.io:443",
        ELASTICSEARCH_API_KEY: "some-key",
        MCP_TRANSPORT: "streamable-http",
      },
      clientFactory: vi.fn(() => ({ search: vi.fn() }) as never),
      app: fakeExpressApp(),
    });

    expect(callOrder[0]).toBe("applyAuthorization");
    expect(callOrder.slice(1).every((call) => call === "registerTool")).toBe(true);
    expect(registerToolSpy).toHaveBeenCalledTimes(13);
  }, 15000);

  it(
    "mounts POST on the path from MCP_PUBLIC_URL, not a hardcoded /mcp (shared ALB path routing)",
    async () => {
      vi.spyOn(McpServer.prototype, "registerTool").mockImplementation(() => undefined as never);
      const app = fakeExpressApp();

      const { startHttpServer } = await import("./http.js");

      await startHttpServer({
        env: {
          ELASTICSEARCH_URL: "https://example.es.region.cloud.es.io:443",
          ELASTICSEARCH_API_KEY: "some-key",
          MCP_TRANSPORT: "streamable-http",
          MCP_PUBLIC_URL: "https://mcp.gutierrezautomotriz.com/elk-observability/mcp",
        },
        clientFactory: vi.fn(() => ({ search: vi.fn() }) as never),
        app,
      });

      expect(app.post).toHaveBeenCalledWith("/elk-observability/mcp", expect.any(Function));
    },
    15000,
  );
});
