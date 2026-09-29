import express, { type Express } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildCognitoAvpAuth, loadCognitoAvpSettings } from "mcp-cognito-avp";
import { registerTools } from "../server/index.js";
import { loadConnectionProfiles, createMakeSqlConfig } from "../config/sql-config.js";
import { TOOL_AUTHORIZATION_MAP } from "../tools/tool_authorization_map.js";

export interface HttpServerOptions {
  env?: Record<string, string | undefined>;
  app?: Express;
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<Express> {
  const env = options.env ?? process.env;
  const settings = loadCognitoAvpSettings(env);
  const profiles = loadConnectionProfiles(env);
  const makeSqlConfig = createMakeSqlConfig(profiles);

  const auth = buildCognitoAvpAuth(settings, { toolMap: TOOL_AUTHORIZATION_MAP });

  const server = new McpServer({ name: "mcp-sqlserver", version: "1.0.0" });
  auth.applyAuthorization(server);
  registerTools(server, { makeSqlConfig });

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
