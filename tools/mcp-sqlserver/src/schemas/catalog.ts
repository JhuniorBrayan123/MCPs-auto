import z from "zod";
import { CONNECTION_NAMES } from "../connection-profiles.js";

/**
 * Parámetros comunes de las tools genéricas (`sqlserver_*`): perfil de
 * conexión + overrides de credenciales. Un perfil representa un SERVIDOR con
 * una sola credencial; la base se elige por llamada (`database`) o se usa la
 * base por defecto del login.
 */

export const connectionParam = z
  .enum(CONNECTION_NAMES)
  .default("drt")
  .describe(
    "Perfil de conexión a usar: 'dev' (desarrollo), 'drt' (comprobación de recetas / CRT) o 'prd' (producción)"
  );

/** Overrides de servidor y credenciales (sin `database`). */
export const credentialOverrideParams = {
  server: z.string().optional().describe("Servidor SQL (sobreescribe el perfil)"),
  user: z.string().optional().describe("Usuario (sobreescribe el perfil)"),
  password: z.string().optional().describe("Contraseña (sobreescribe el perfil)"),
};

export const databaseParam = z
  .string()
  .optional()
  .describe(
    "Base de datos a usar: cualquier base del servidor a la que el login tenga acceso (ver sqlserver_list_databases). Vacío = la del perfil o la base por defecto del login"
  );

export const overrideParams = {
  server: credentialOverrideParams.server,
  database: databaseParam,
  user: credentialOverrideParams.user,
  password: credentialOverrideParams.password,
};

export const listDatabasesShape = {
  connection: connectionParam,
  includeSystem: z
    .boolean()
    .optional()
    .default(false)
    .describe("Incluir bases de sistema (master, tempdb, model, msdb). Por defecto false"),
  ...credentialOverrideParams,
};

export const searchObjectsShape = {
  connection: connectionParam,
  text: z
    .string()
    .min(1)
    .describe("Texto a buscar (coincidencia parcial, literal) en nombres de tablas, vistas, procedimientos y funciones"),
  includeColumns: z
    .boolean()
    .optional()
    .default(false)
    .describe("Buscar también en nombres de columnas de tablas y vistas"),
  databases: z
    .array(z.string())
    .optional()
    .describe("Limitar la búsqueda a estas bases. Por defecto: todas las bases de usuario ONLINE accesibles"),
  includeSystem: z
    .boolean()
    .optional()
    .default(false)
    .describe("Incluir bases de sistema cuando no se pasa `databases`. Por defecto false"),
  limit: z.coerce.number().int().min(1).max(5000).default(200).describe("Máximo total de coincidencias a retornar"),
  ...credentialOverrideParams,
};

export type ListDatabasesInput = z.infer<z.ZodObject<typeof listDatabasesShape>>;
export type SearchObjectsInput = z.infer<z.ZodObject<typeof searchObjectsShape>>;
