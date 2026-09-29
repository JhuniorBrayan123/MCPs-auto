import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JenkinsClient, JenkinsHttpError, jobApiPath } from "../jenkins-client.js";
import { buildNumberParam, errorContent, jobPathParam, textContent } from "../schemas.js";

function writeGuardMessage(action: string): string {
  return (
    `${action} está deshabilitado: este MCP corre en modo SOLO LECTURA. ` +
    `Activa JENKINS_ALLOW_WRITE=true en el .env de la raíz si realmente quieres permitir esta acción.`
  );
}

export function registerBuildTools(
  server: McpServer,
  deps: { client: JenkinsClient; allowWrite: boolean }
) {
  const { client, allowWrite } = deps;

  server.tool(
    "jenkins_get_build",
    "Obtiene el detalle de un build: resultado, si está corriendo, duración, causas del disparo, parámetros usados y cambios de SCM incluidos.",
    { jobPath: jobPathParam, buildNumber: buildNumberParam },
    async ({ jobPath, buildNumber }) => {
      try {
        const data = await client.getJson(`${jobApiPath(jobPath)}/${buildNumber}/api/json`, {
          tree:
            "number,result,building,timestamp,duration,estimatedDuration,url," +
            "actions[causes[shortDescription],parameters[name,value]]," +
            "changeSet[items[msg,author[fullName],commitId,affectedPaths]]",
        });
        return textContent(JSON.stringify(data, null, 2));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    "jenkins_get_console_log",
    "Obtiene el log de consola de un build. `tailLines` recorta a las últimas N líneas (default 200) para no saturar el contexto; usa 0 para el log completo.",
    {
      jobPath: jobPathParam,
      buildNumber: buildNumberParam,
      tailLines: z.coerce.number().int().min(0).optional().default(200).describe("Últimas N líneas (0 = log completo)"),
    },
    async ({ jobPath, buildNumber, tailLines }) => {
      try {
        const text = await client.getText(`${jobApiPath(jobPath)}/${buildNumber}/consoleText`);
        if (tailLines === 0) return textContent(text);
        const lines = text.split(/\r?\n/);
        const tail = lines.slice(Math.max(0, lines.length - tailLines));
        return textContent(
          `(mostrando últimas ${tail.length} de ${lines.length} líneas)\n\n${tail.join("\n")}`
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    "jenkins_get_build_changes",
    "Obtiene únicamente los cambios de SCM (commits) incluidos en un build.",
    { jobPath: jobPathParam, buildNumber: buildNumberParam },
    async ({ jobPath, buildNumber }) => {
      try {
        const data = await client.getJson<{ changeSet?: unknown }>(
          `${jobApiPath(jobPath)}/${buildNumber}/api/json`,
          { tree: "changeSet[items[msg,author[fullName],commitId,affectedPaths,timestamp]]" }
        );
        return textContent(JSON.stringify(data.changeSet ?? { items: [] }, null, 2));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    "jenkins_get_pipeline_stages",
    "Obtiene las etapas (stages) de un build de Pipeline (requiere el plugin 'Pipeline: REST API' / wfapi). Si el plugin no está instalado, devuelve un error explicativo.",
    { jobPath: jobPathParam, buildNumber: buildNumberParam },
    async ({ jobPath, buildNumber }) => {
      try {
        const data = await client.getJson(`${jobApiPath(jobPath)}/${buildNumber}/wfapi/describe`);
        return textContent(JSON.stringify(data, null, 2));
      } catch (err) {
        if (err instanceof JenkinsHttpError && err.status === 404) {
          return errorContent(
            new Error(
              "No se encontraron stages: el job no es un Pipeline o falta el plugin 'Pipeline: REST API' (wfapi)."
            )
          );
        }
        return errorContent(err);
      }
    }
  );

  server.tool(
    "jenkins_trigger_build",
    "Dispara un nuevo build, con o sin parámetros. Requiere JENKINS_ALLOW_WRITE=true (por defecto el MCP es de solo lectura).",
    {
      jobPath: jobPathParam,
      parameters: z
        .record(z.string(), z.string())
        .optional()
        .describe("Parámetros del build como pares clave-valor (todos como string). Omitir si el job no tiene parámetros."),
    },
    async ({ jobPath, parameters }) => {
      if (!allowWrite) {
        return errorContent(new Error(writeGuardMessage("jenkins_trigger_build")));
      }
      try {
        const path = parameters && Object.keys(parameters).length > 0
          ? `${jobApiPath(jobPath)}/buildWithParameters`
          : `${jobApiPath(jobPath)}/build`;
        const res = await client.postForm(path, undefined, parameters);
        const queueLocation = res.headers.get("location");
        return textContent(
          `Build disparado para "${jobPath}".${queueLocation ? `\nUbicación en cola: ${queueLocation}` : ""}`
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    "jenkins_stop_build",
    "Aborta un build en ejecución. Requiere JENKINS_ALLOW_WRITE=true (por defecto el MCP es de solo lectura).",
    { jobPath: jobPathParam, buildNumber: buildNumberParam },
    async ({ jobPath, buildNumber }) => {
      if (!allowWrite) {
        return errorContent(new Error(writeGuardMessage("jenkins_stop_build")));
      }
      try {
        await client.postForm(`${jobApiPath(jobPath)}/${buildNumber}/stop`);
        return textContent(`Build ${buildNumber} de "${jobPath}" abortado (o abort solicitado).`);
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
