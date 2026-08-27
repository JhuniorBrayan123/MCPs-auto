import type { SqlSearchClientLike } from "../sql/search.js";
import { buildResumenQuery } from "../sql/query-builder.js";
import { estimateIdlogFloor, formatearFechaLocal } from "./shared.js";
import type { ConnectionName } from "../connection-profiles.js";

export interface ResumenParams {
  connection: ConnectionName;
  dias?: number;
  desde?: string;
  fechaDesde: Date;
  fechaHasta: Date;
}

export interface ResumenRow {
  modulo: string;
  nivel: string;
  cantidad: number;
}

export interface ResumenResult {
  connection: ConnectionName;
  etiquetaRango: string;
  recordset: ResumenRow[];
}

/**
 * Domain logic for the `erp_fallas_resumen` tool, copied from the original
 * inline handler. `fechaDesde`/`fechaHasta` arrive already parsed/validated
 * by `domain/shared.ts::parseRangoRelativoOFijo` — see `tools/erp_fallas_resumen.ts`.
 */
export async function getResumen(client: SqlSearchClientLike, params: ResumenParams): Promise<ResumenResult> {
  const { connection, dias, desde, fechaDesde, fechaHasta } = params;

  const diasParaFloor = Math.max((Date.now() - fechaDesde.getTime()) / 86_400_000, 1 / 24);
  const idlogFloor = await estimateIdlogFloor(client, diasParaFloor);

  const result = await client.query<ResumenRow>(
    buildResumenQuery({ idlogFloor: BigInt(idlogFloor), desde: fechaDesde, hasta: fechaHasta })
  );

  const etiquetaRango = desde
    ? `entre ${formatearFechaLocal(fechaDesde)} y ${formatearFechaLocal(fechaHasta)}`
    : `últimos ${dias ?? 1} día(s)`;

  return { connection, etiquetaRango, recordset: result.recordset };
}
