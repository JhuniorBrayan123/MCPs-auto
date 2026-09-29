import express, { type Express } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildCognitoAvpAuth, loadCognitoAvpSettings } from "mcp-cognito-avp";
import { loadEnv } from "../config/env.js";
import { createElasticsearchClient, type ClientFactory } from "../elastic/client.js";
import type { SearchClientLike } from "../elastic/search.js";
import { registerTools } from "../server/index.js";
import type { ToolDeps } from "../tools/shared.js";
import { TOOL_AUTHORIZATION_MAP } from "../tools/tool_authorization_map.js";

export interface HttpServerOptions {
  env?: Record<string, string | undefined>;
  clientFactory?: ClientFactory;
  app?: Express;
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<Express> {
  const env = options.env ?? process.env;
  const config = loadEnv(env);
  const settings = loadCognitoAvpSettings(env);

  const esClient = createElasticsearchClient(
    {
      elasticsearchUrl: config.elasticsearchUrl,
      elasticsearchApiKey: config.elasticsearchApiKey,
    },
    options.clientFactory,
  );

  const deps: ToolDeps = {
    client: esClient as unknown as SearchClientLike,
    traceIndex: config.apmTraceIndex,
    errorIndex: config.apmErrorIndex,
    extraSensitiveFields: config.extraSensitiveFields,
  };

  const auth = buildCognitoAvpAuth(settings, { toolMap: TOOL_AUTHORIZATION_MAP });

  const server = new McpServer({ name: "mcp-elk-observability", version: "0.1.0" });
  auth.applyAuthorization(server);
  registerTools(server, deps);

  const app = options.app ?? express();
  app.use(express.json());
  auth.mountAuthRoutes(app);

  app.get("/api/v1/conectividades", (_req, res) => {
    res.status(200).send("ok");
  });

  const mcpPath = new URL(settings.mcpPublicUrl).pathname;

  app.post(
    mcpPath,
    ...(auth.bearerAuthMiddleware ? [auth.bearerAuthMiddleware] : []),
    async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    },
  );

  if (options.app === undefined) {
    app.listen(settings.mcpPort, settings.mcpHost);
  }

  return app;
}
