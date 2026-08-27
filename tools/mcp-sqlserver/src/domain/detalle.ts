import type { SqlSearchClientLike } from "../sql/search.js";
import { buildDetalleQuery } from "../sql/query-builder.js";
import { logNotFoundError } from "../utils/errors.js";
import type { ConnectionName } from "../connection-profiles.js";

export interface DetalleParams {
  connection: ConnectionName;
  idlog: number;
}

export interface DetalleRow {
  idlog: number;
  fecha: Date;
  modulo: string;
  tipo: string;
  nivel: string;
  usuario: string;
  ubicacion: string;
  mensaje: string;
  traza: string;
}

export interface DetalleResult {
  connection: ConnectionName;
  idlog: number;
  row: DetalleRow;
}

/**
 * Domain logic for the `erp_falla_detalle` tool, copied from the original
 * inline handler. Throws `logNotFoundError` (not a `SqlError`) when the row
 * doesn't exist — the tool layer renders that specific case as a normal
 * (non-error) result, matching the original behavior.
 */
export async function getDetalle(client: SqlSearchClientLike, params: DetalleParams): Promise<DetalleResult> {
  const { connection, idlog } = params;

  // Un solo idlog = seek directo por la PK clustered, instantáneo aunque no
  // exista índice en fecha.
  const result = await client.query<DetalleRow>(buildDetalleQuery(idlog));

  if (result.recordset.length === 0) {
    throw logNotFoundError(idlog);
  }

  return { connection, idlog, row: result.recordset[0] as DetalleRow };
}
