import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JenkinsClient } from "./jenkins-client.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerBuildTools } from "./tools/builds.js";
import { errorContent, textContent } from "./schemas.js";

// Carga el .env de la RAÍZ del proyecto por ruta explícita (mismo patrón que
// mcp-bookstack/mcp-sqlserver): tools/mcp-jenkins/dist/../../../.env
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });
// Fallback: .env propio de esta carpeta (tools/mcp-jenkins/.env), también por
// ruta explícita y no por cwd — así funciona igual sin importar desde dónde
// se invoque el proceso (p.ej. opencode.json lo lanza con cwd en la raíz).
// dotenv no sobreescribe variables ya seteadas por el .env de la raíz.
loadEnv({ path: resolve(here, "../.env") });

const envSchema = z.object({
  JENKINS_URL: z.string().url("JENKINS_URL debe ser una URL válida, p.ej. http://localhost:8080"),
  JENKINS_USER: z.string().min(1, "JENKINS_USER es requerido"),
  JENKINS_TOKEN: z.string().min(1, "JENKINS_TOKEN es requerido"),
  JENKINS_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  JENKINS_ALLOW_WRITE: z
    .string()
    .optional()
    .transform((v) => v?.toLowerCase() === "true")
    .pipe(z.boolean()),
  JENKINS_INSECURE_TLS: z
    .string()
    .optional()
    .transform((v) => v?.toLowerCase() === "true")
    .pipe(z.boolean()),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Configuración de Jenkins inválida o incompleta:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("Revisa .env.example en tools/mcp-jenkins/ y copia las variables al .env de la raíz.");
  process.exit(1);
}
const env = parsed.data;

const client = new JenkinsClient({
  baseUrl: env.JENKINS_URL,
  user: env.JENKINS_USER,
  token: env.JENKINS_TOKEN,
  timeoutMs: env.JENKINS_TIMEOUT_MS,
  insecureTls: env.JENKINS_INSECURE_TLS,
});

const server = new McpServer({
  name: "mcp-jenkins",
  version: "1.0.0",
});

server.tool(
  "jenkins_test_connection",
  "Verifica la conexión y credenciales contra Jenkins, devolviendo versión y modo del servidor.",
  {},
  async () => {
    try {
      const data = await client.getJson<{ mode?: string; nodeName?: string; numExecutors?: number }>(
        "api/json",
        { tree: "mode,nodeName,numExecutors" }
      );
      return textContent(
        `Conexión exitosa a Jenkins.\nURL: ${env.JENKINS_URL}\nUsuario: ${env.JENKINS_USER}\nModo: ${data.mode ?? "desconocido"}\nEjecutores: ${data.numExecutors ?? "?"}\nModo de escritura: ${env.JENKINS_ALLOW_WRITE ? "HABILITADO" : "deshabilitado (solo lectura)"}`
      );
    } catch (err) {
      return errorContent(err);
    }
  }
);

registerJobTools(server, { client });
registerBuildTools(server, { client, allowWrite: env.JENKINS_ALLOW_WRITE });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Jenkins corriendo (stdio)");
  console.error(`   URL: ${env.JENKINS_URL} | modo escritura: ${env.JENKINS_ALLOW_WRITE ? "ON" : "OFF"}`);
}

main().catch((err) => {
  console.error("Error starting MCP server:", err);
  process.exit(1);
});
