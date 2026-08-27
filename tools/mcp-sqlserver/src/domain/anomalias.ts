import type { SqlSearchClientLike } from "../sql/search.js";
import { buildAnomaliasQuery } from "../sql/query-builder.js";
import { estimateIdlogFloor, computeAnomalias, type Anomalia, type AnomaliaRow } from "./shared.js";
import type { ConnectionName } from "../connection-profiles.js";

export interface AnomaliasParams {
  connection: ConnectionName;
  horasRecientes: number;
  diasBaseline: number;
  limit: number;
}

export interface AnomaliasResult {
  connection: ConnectionName;
  horasRecientes: number;
  diasBaseline: number;
  anomalias: Anomalia[];
}

/** Domain logic for the `erp_anomalias` tool, copied from the original inline handler. */
export async function getAnomalias(
  client: SqlSearchClientLike,
  params: AnomaliasParams
): Promise<AnomaliasResult> {
  const { connection, horasRecientes, diasBaseline, limit } = params;

  const diasTotal = horasRecientes / 24 + diasBaseline;
  const idlogFloor = await estimateIdlogFloor(client, diasTotal);
  const corteReciente = new Date(Date.now() - horasRecientes * 3_600_000);
  const inicioBaseline = new Date(Date.now() - diasTotal * 86_400_000);

  const result = await client.query<AnomaliaRow>(
    buildAnomaliasQuery({ idlogFloor: BigInt(idlogFloor), inicioBaseline, corteReciente })
  );

  const anomalias = computeAnomalias(result.recordset, { horasRecientes, diasBaseline, limit });

  return { connection, horasRecientes, diasBaseline, anomalias };
}
