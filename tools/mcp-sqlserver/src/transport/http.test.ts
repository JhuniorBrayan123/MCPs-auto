import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const callOrder: string[] = [];

mock.module("mcp-cognito-avp", {
  cache: false,
  namedExports: {
    loadCognitoAvpSettings: (env: Record<string, string | undefined> = process.env) => ({
      mcpTransport: env.MCP_TRANSPORT ?? "stdio",
      mcpHost: "127.0.0.1",
      mcpPort: 0,
      mcpPublicUrl: env.MCP_PUBLIC_URL ?? "http://127.0.0.1:0/mcp",
    }),
    toolAuthorization: (args: unknown) => args,
    buildCognitoAvpAuth: () => ({
      transport: "streamable-http",
      bearerAuthMiddleware: undefined,
      resourceMetadataUrl: undefined,
      cognitoOAuthProxyProvider: undefined,
      cognitoCallbackPath: "/oauth/cognito/callback",
      mountAuthRoutes: () => {},
      applyAuthorization: (server: unknown) => {
        callOrder.push("applyAuthorization");
        return server;
      },
    }),
  },
});

describe("startHttpServer", () => {
  it("calls auth.applyAuthorization before any tool is registered", async () => {
    callOrder.length = 0;
    const toolMock = mock.method(McpServer.prototype, "tool", function (this: unknown) {
      callOrder.push("tool");
      return undefined as never;
    });

    const { startHttpServer } = await import("./http.js");

    const fakeApp = {
      use: () => {},
      post: () => {},
      get: () => {},
      listen: () => {},
    };

    await startHttpServer({
      env: {
        MCP_TRANSPORT: "streamable-http",
        SQLSERVER_DEV_SERVER: "localhost",
        SQLSERVER_DRT_SERVER: "localhost",
        SQLSERVER_PRD_SERVER: "localhost",
      },
      app: fakeApp as never,
    });

    assert.equal(callOrder[0], "applyAuthorization");
    assert.ok(callOrder.slice(1).every((call) => call === "tool"));
    assert.equal(toolMock.mock.callCount(), 8);

    toolMock.mock.restore();
  });

  it("mounts POST on the path from MCP_PUBLIC_URL, not a hardcoded /mcp (shared ALB path routing)", async () => {
    const toolMock = mock.method(McpServer.prototype, "tool", () => undefined as never);
    let postedPath: string | undefined;
    const fakeApp = {
      use: () => {},
      post: (path: string, ..._handlers: unknown[]) => {
        postedPath = path;
      },
      get: () => {},
      listen: () => {},
    };

    const { startHttpServer } = await import("./http.js");

    await startHttpServer({
      env: {
        MCP_TRANSPORT: "streamable-http",
        MCP_PUBLIC_URL: "https://mcp.gutierrezautomotriz.com/sqlserver/mcp",
        SQLSERVER_DEV_SERVER: "localhost",
        SQLSERVER_DRT_SERVER: "localhost",
        SQLSERVER_PRD_SERVER: "localhost",
      },
      app: fakeApp as never,
    });

    assert.equal(postedPath, "/sqlserver/mcp");

    toolMock.mock.restore();
  });
});
