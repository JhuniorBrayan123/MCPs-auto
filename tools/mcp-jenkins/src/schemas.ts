import { z } from "zod";

export const jobPathParam = z
  .string()
  .describe(
    "Ruta del job tal como se ve en la UI de Jenkins, con '/' para carpetas (p.ej. \"mi-carpeta/mi-job\"). No incluyas 'job/' ni la URL completa."
  );

export const buildNumberParam = z
  .union([z.coerce.number().int(), z.enum(["lastBuild", "lastSuccessfulBuild", "lastFailedBuild", "lastCompletedBuild", "lastStableBuild"])])
  .default("lastBuild")
  .describe(
    "Número de build o alias: lastBuild, lastSuccessfulBuild, lastFailedBuild, lastCompletedBuild, lastStableBuild."
  );

export function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
