import z from "zod";
import { connectionParam, credentialOverrideParams } from "./catalog.js";
import { TOP_QUERIES_ORDER_BY } from "../sql/tuning.js";

/**
 * Parámetros de las tools de tuning (solo lectura, DMVs). Reutilizan el perfil
 * de conexión y los overrides de credenciales de las tools de catálogo; la
 * base NO se pasa como override de conexión sino como filtro validado contra
 * `sys.databases`.
 */

const serverWideDatabaseFilter = z
  .string()
  .optional()
  .describe("Filtrar por esta base (nombre, validado contra sys.databases). Vacío = todas las bases del servidor");

export const missingIndexesShape = {
  connection: connectionParam,
  database: serverWideDatabaseFilter,
  limit: z.coerce.number().int().min(1).max(500).default(25).describe("Máximo de índices sugeridos a retornar"),
  ...credentialOverrideParams,
};

export const topQueriesShape = {
  connection: connectionParam,
  orderBy: z
    .enum(TOP_QUERIES_ORDER_BY)
    .default("cpu")
    .describe("Criterio de orden: cpu (worker time), duration (elapsed), reads (lecturas lógicas), writes o executions"),
  database: serverWideDatabaseFilter,
  limit: z.coerce.number().int().min(1).max(200).default(20).describe("Máximo de consultas a retornar (máx. 200)"),
  ...credentialOverrideParams,
};

export const indexUsageShape = {
  connection: connectionParam,
  database: z
    .string()
    .min(1)
    .describe("Base a analizar (obligatoria; debe ser accesible por el login, ver sqlserver_list_databases)"),
  onlyUnused: z
    .boolean()
    .optional()
    .default(false)
    .describe("true = solo índices 'sin uso' (sin lecturas pero con escrituras; excluye PK y UNIQUE)"),
  limit: z.coerce.number().int().min(1).max(2000).default(200).describe("Máximo de índices a retornar"),
  ...credentialOverrideParams,
};

export const blockingShape = {
  connection: connectionParam,
  onlyBlocked: z
    .boolean()
    .optional()
    .default(false)
    .describe("true = solo requests bloqueados por otra sesión"),
  minElapsedMs: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Solo requests con al menos estos milisegundos de ejecución"),
  limit: z.coerce.number().int().min(1).max(500).default(100).describe("Máximo de requests a retornar"),
  ...credentialOverrideParams,
};

export type MissingIndexesInput = z.infer<z.ZodObject<typeof missingIndexesShape>>;
export type TopQueriesInput = z.infer<z.ZodObject<typeof topQueriesShape>>;
export type IndexUsageInput = z.infer<z.ZodObject<typeof indexUsageShape>>;
export type BlockingInput = z.infer<z.ZodObject<typeof blockingShape>>;
