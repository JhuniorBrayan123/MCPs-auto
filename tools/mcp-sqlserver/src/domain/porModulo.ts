import type { SqlSearchClientLike } from "../sql/search.js";
import { buildPorModuloQuery } from "../sql/query-builder.js";
import { estimateIdlogFloor } from "./shared.js";
import type { ConnectionName } from "../connection-profiles.js";

export interface PorModuloParams {
  connection: ConnectionName;
  dias: number;
  modulo: string;
  limit: number;
}

export interface PorModuloRow {
  tipo: string;
  nivel: string;
  cantidad: number;
  primera_vez: Date;
  ultima_vez: Date;
  idlog_ejemplo: number;
}

export interface PorModuloResult {
  connection: ConnectionName;
  dias: number;
  modulo: string;
  recordset: PorModuloRow[];
}

/** Domain logic for the `erp_fallas_por_modulo` tool, copied from the original inline handler. */
export async function getPorModulo(
  client: SqlSearchClientLike,
  params: PorModuloParams
): Promise<PorModuloResult> {
  const { connection, dias, modulo, limit } = params;

  const idlogFloor = await estimateIdlogFloor(client, dias);

  const result = await client.query<PorModuloRow>(
    buildPorModuloQuery({
      idlogFloor: BigInt(idlogFloor),
      desde: new Date(Date.now() - dias * 86_400_000),
      modulo,
      limit,
    })
  );

  return { connection, dias, modulo, recordset: result.recordset };
}
