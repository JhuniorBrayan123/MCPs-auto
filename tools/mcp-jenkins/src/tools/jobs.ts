import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JenkinsClient, jobApiPath } from "../jenkins-client.js";
import { errorContent, jobPathParam, textContent } from "../schemas.js";

interface JobSummary {
  name: string;
  url: string;
  color?: string;
  _class?: string;
  buildable?: boolean;
}

const FOLDER_CLASS_HINTS = ["Folder", "WorkflowMultiBranchProject", "OrganizationFolder"];

function isFolder(job: JobSummary): boolean {
  return FOLDER_CLASS_HINTS.some((hint) => job._class?.includes(hint));
}

const JOBS_TREE =
  "jobs[name,url,color,buildable,_class]";

async function listJobsAt(
  client: JenkinsClient,
  folderPath: string | undefined,
  recursive: boolean,
  maxDepth: number,
  currentDepth = 0,
  prefix = ""
): Promise<Array<{ path: string; isFolder: boolean; buildable?: boolean; color?: string }>> {
  const base = folderPath ? `${jobApiPath(folderPath)}/` : "";
  const data = await client.getJson<{ jobs?: JobSummary[] }>(`${base}api/json`, {
    tree: JOBS_TREE,
  });
  const jobs = data.jobs ?? [];
  const results: Array<{ path: string; isFolder: boolean; buildable?: boolean; color?: string }> = [];

  for (const job of jobs) {
    const path = prefix ? `${prefix}/${job.name}` : job.name;
    const folder = isFolder(job);
    results.push({ path, isFolder: folder, buildable: job.buildable, color: job.color });

    if (folder && recursive && currentDepth < maxDepth) {
      const nested = await listJobsAt(client, path, recursive, maxDepth, currentDepth + 1, path);
      results.push(...nested);
    }
  }

  return results;
}

export function registerJobTools(server: McpServer, deps: { client: JenkinsClient }) {
  const { client } = deps;

  server.tool(
    "jenkins_list_jobs",
    "Lista jobs de Jenkins. Sin `folderPath` lista la raíz. `recursive=true` entra a carpetas (plugin Folders) hasta `maxDepth` niveles.",
    {
      folderPath: jobPathParam.optional().describe("Carpeta desde la cual listar (opcional, default raíz)"),
      recursive: z.boolean().optional().default(false).describe("Si true, explora subcarpetas recursivamente"),
      maxDepth: z.coerce.number().int().min(1).max(10).optional().default(3).describe("Profundidad máxima cuando recursive=true"),
    },
    async ({ folderPath, recursive, maxDepth }) => {
      try {
        const jobs = await listJobsAt(client, folderPath, recursive, maxDepth);
        return textContent(JSON.stringify({ count: jobs.length, jobs }, null, 2));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    "jenkins_get_job",
    "Obtiene el detalle de un job: descripción, estado de salud, parámetros configurados y referencias a sus últimos builds.",
    { jobPath: jobPathParam },
    async ({ jobPath }) => {
      try {
        const data = await client.getJson(`${jobApiPath(jobPath)}/api/json`, {
          tree:
            "name,description,buildable,url,color,_class," +
            "healthReport[description,score]," +
            "lastBuild[number,url,timestamp,result,building]," +
            "lastSuccessfulBuild[number,url,timestamp]," +
            "lastFailedBuild[number,url,timestamp]," +
            "lastCompletedBuild[number,url,timestamp]," +
            "property[parameterDefinitions[name,type,description,defaultParameterValue[value]]]",
        });
        return textContent(JSON.stringify(data, null, 2));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    "jenkins_get_queue",
    "Lista los items en la cola de build de Jenkins (pendientes, bloqueados o atascados), útil para saber qué está esperando ejecutarse.",
    {},
    async () => {
      try {
        const data = await client.getJson("queue/api/json", {
          tree: "items[id,why,inQueueSince,stuck,blocked,task[name,url],actions[causes[shortDescription]]]",
        });
        return textContent(JSON.stringify(data, null, 2));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.tool(
    "jenkins_get_nodes",
    "Lista los nodos/agentes de Jenkins (master + agentes): si están offline, ocupados, y número de ejecutores.",
    {},
    async () => {
      try {
        const data = await client.getJson("computer/api/json", {
          tree:
            "busyExecutors,totalExecutors,computer[displayName,offline,offlineCauseReason,temporarilyOffline,numExecutors,idle]",
        });
        return textContent(JSON.stringify(data, null, 2));
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}

export { listJobsAt };
