import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
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
  beforeEach(() => {
    process.env.BOOKSTACK_BASE_URL = "https://bookstack.example.com";
    process.env.BOOKSTACK_TOKEN_ID = "test-id";
    process.env.BOOKSTACK_TOKEN_SECRET = "test-secret";
    process.env.MCP_TRANSPORT = "streamable-http";
  });

  afterEach(() => {
    callOrder.length = 0;
    vi.restoreAllMocks();
    delete process.env.BOOKSTACK_BASE_URL;
    delete process.env.BOOKSTACK_TOKEN_ID;
    delete process.env.BOOKSTACK_TOKEN_SECRET;
    delete process.env.MCP_TRANSPORT;
  });

  it(
    "calls auth.applyAuthorization before any tool is registered",
    async () => {
      const registerToolSpy = vi.spyOn(McpServer.prototype, "registerTool").mockImplementation(function (
        this: unknown,
      ) {
        callOrder.push("registerTool");
        return undefined as never;
      });

      const { startHttpServer } = await import("./http.js");

      await startHttpServer({ app: fakeExpressApp() });

      expect(callOrder[0]).toBe("applyAuthorization");
      expect(callOrder.slice(1).every((call) => call === "registerTool")).toBe(true);
      expect(registerToolSpy).toHaveBeenCalledTimes(11);
    },
    15000,
  );

  it(
    "mounts POST on the path from MCP_PUBLIC_URL, not a hardcoded /mcp (shared ALB path routing)",
    async () => {
      vi.spyOn(McpServer.prototype, "registerTool").mockImplementation(() => undefined as never);
      process.env.MCP_PUBLIC_URL = "https://mcp.gutierrezautomotriz.com/bookstack/mcp";
      const app = fakeExpressApp();

      const { startHttpServer } = await import("./http.js");

      await startHttpServer({ app });

      expect(app.post).toHaveBeenCalledWith("/bookstack/mcp", expect.any(Function));
      delete process.env.MCP_PUBLIC_URL;
    },
    15000,
  );
});
