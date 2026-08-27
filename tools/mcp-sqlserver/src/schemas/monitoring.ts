import z from "zod";
import { CONNECTION_NAMES } from "../connection-profiles.js";

/**
 * Zod schemas for the 5 `SRExcepcion` monitoring tools, extracted verbatim
 * (same fields, types, defaults, min/max, and `.describe()` copy) from the
 * inline shapes that used to live in `monitoring-tools.ts`. Each is exported
 * as a `ZodRawShape` because that's what `server.tool(name, shape, handler)`
 * expects (same call shape already proven by `src/index.ts`'s other tools).
 */

export const connectionParam = z
  .enum(CONNECTION_NAMES)
  .default("drt")
  .describe("Perfil de conexión: 'dev' (desarrollo), 'drt' (SRExcepcion / CRT) o 'prd' (producción)");

export const diasParam = z.coerce
  .number()
  .min(1)
  .max(90)
  .default(1)
  .describe("Cuántos días hacia atrás desde ahora (máximo 90)");

export const erpFallasResumenShape = {
  connection: connectionParam,
  dias: diasParam.optional().describe(
    "Cuántos días hacia atrás desde ahora (máximo 90). Ignorado si pasas 'desde'."
  ),
  desde: z
    .string()
    .optional()
    .describe(
      "En vez de 'dias', un rango explícito: inicio (ej: '2026-08-24T08:00:00'). Interpretado en hora del servidor."
    ),
  hasta: z
    .string()
    .optional()
    .describe("Fin del rango explícito (solo aplica junto con 'desde'). Si se omite, usa el momento actual."),
};
export const erpFallasResumenSchema = z.object(erpFallasResumenShape);
export type ErpFallasResumenInput = z.infer<typeof erpFallasResumenSchema>;

export const erpFallasPorModuloShape = {
  connection: connectionParam,
  dias: diasParam,
  modulo: z.string().describe("Nombre del módulo tal como aparece en erp_fallas_resumen (ej: 'mscontabilidad')"),
  limit: z.coerce.number().default(20).describe("Máximo de firmas de error distintas a devolver"),
};
export const erpFallasPorModuloSchema = z.object(erpFallasPorModuloShape);
export type ErpFallasPorModuloInput = z.infer<typeof erpFallasPorModuloSchema>;

export const erpFallaDetalleShape = {
  connection: connectionParam,
  idlog: z.coerce
    .number()
    .describe("idlog exacto de la fila (lo entrega erp_fallas_por_modulo como 'idlog_ejemplo')"),
};
export const erpFallaDetalleSchema = z.object(erpFallaDetalleShape);
export type ErpFallaDetalleInput = z.infer<typeof erpFallaDetalleSchema>;

export const erpAnomaliasShape = {
  connection: connectionParam,
  horasRecientes: z.coerce
    .number()
    .min(1)
    .max(72)
    .default(24)
    .describe("Ventana 'reciente' a analizar, en horas"),
  diasBaseline: z.coerce
    .number()
    .min(1)
    .max(30)
    .default(7)
    .describe("Cuántos días previos a la ventana reciente se usan como referencia de 'lo normal'"),
  limit: z.coerce.number().default(15).describe("Máximo de anomalías a devolver"),
};
export const erpAnomaliasSchema = z.object(erpAnomaliasShape);
export type ErpAnomaliasInput = z.infer<typeof erpAnomaliasSchema>;

export const erpFallasRangoShape = {
  connection: connectionParam,
  desde: z
    .string()
    .describe("Inicio del rango, fecha y hora (ej: '2026-08-25T10:00:00'). Interpretada en hora del servidor."),
  hasta: z
    .string()
    .optional()
    .describe("Fin del rango, fecha y hora. Si se omite, usa el momento actual."),
  modulo: z.string().optional().describe("Filtrar solo por este módulo (opcional)"),
  limit: z.coerce
    .number()
    .max(100)
    .default(50)
    .describe("Máximo de filas a devolver (tope 100 — si necesitas ver más, filtra por módulo o acorta el rango)"),
};
export const erpFallasRangoSchema = z.object(erpFallasRangoShape);
export type ErpFallasRangoInput = z.infer<typeof erpFallasRangoSchema>;
