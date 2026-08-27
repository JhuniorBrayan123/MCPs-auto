import type { SqlSearchClientLike } from "../sql/search.js";
import { buildRangoConteoQuery, buildRangoDetalleQuery } from "../sql/query-builder.js";
import { estimateIdlogFloor } from "./shared.js";
import type { ConnectionName } from "../connection-profiles.js";

export interface RangoParams {
  connection: ConnectionName;
  fechaDesde: Date;
  fechaHasta: Date;
  modulo?: string;
  limit: number;
}

export interface RangoFila {
  idlog: number;
  fecha: Date;
  modulo: string;
  tipo: string;
  nivel: string;
  usuario: string;
  mensaje_resumido: string;
}

export interface RangoResult {
  connection: ConnectionName;
  fechaDesde: Date;
  fechaHasta: Date;
  modulo?: string;
  limit: number;
  total: number;
  filas: RangoFila[];
}

/**
 * Domain logic for the `erp_fallas_rango` tool, copied from the original
 * inline handler. `fechaDesde`/`fechaHasta` arrive already parsed/validated
 * by `domain/shared.ts::parseRangoFijo` — see `tools/erp_fallas_rango.ts`.
 */
export async function getRango(client: SqlSearchClientLike, params: RangoParams): Promise<RangoResult> {
  const { connection, fechaDesde, fechaHasta, modulo, limit } = params;

  // Mismo atajo de idlog que las demás tools: acota por cuántos días atrás
  // cae `desde`, luego `fecha` decide el rango exacto de verdad.
  const diasDesdeAhora = Math.max((Date.now() - fechaDesde.getTime()) / 86_400_000, 1 / 24);
  const idlogFloor = await estimateIdlogFloor(client, diasDesdeAhora);
  const idlogFloorBig = BigInt(idlogFloor);

  // Conteo primero: si hay muchas más filas que el límite, hay que avisarlo
  // en vez de devolver las primeras N en silencio — con ruido crónico (ver
  // erp_anomalias) esto puede ser miles de filas. Ambas queries corren en la
  // MISMA transacción (queryMany), igual que el original.
  const [conteoResult, detalleResult] = await client.queryMany<{ total: number } | RangoFila>([
    buildRangoConteoQuery({ idlogFloor: idlogFloorBig, desde: fechaDesde, hasta: fechaHasta, modulo }),
    buildRangoDetalleQuery({ idlogFloor: idlogFloorBig, desde: fechaDesde, hasta: fechaHasta, modulo, limit }),
  ]);

  const total = (conteoResult.recordset[0] as { total: number }).total;
  const filas = detalleResult.recordset as RangoFila[];

  const result: RangoResult = { connection, fechaDesde, fechaHasta, limit, total, filas };
  if (modulo) result.modulo = modulo;
  return result;
}
