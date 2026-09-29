import express, { type Express } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildCognitoAvpAuth, loadCognitoAvpSettings } from "mcp-cognito-avp";
import { BookStackClient } from "../bookstackClient.js";
import { registerTools } from "../server/index.js";
import { TOOL_AUTHORIZATION_MAP } from "../tools/tool_authorization_map.js";

export interface HttpServerOptions {
  app?: Express;
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<Express> {
  const settings = loadCognitoAvpSettings(process.env);
  const bookStack = new BookStackClient();

  const auth = buildCognitoAvpAuth(settings, { toolMap: TOOL_AUTHORIZATION_MAP });

  const server = new McpServer({ name: "bookstack-documentation-mcp", version: "1.0.0" });
  auth.applyAuthorization(server);
  registerTools(server, { bookStack });

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
