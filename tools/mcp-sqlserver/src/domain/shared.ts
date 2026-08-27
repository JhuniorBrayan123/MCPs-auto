import type { SqlSearchClientLike } from "../sql/search.js";
import { buildMaxIdlogQuery, buildSampleQuery } from "../sql/query-builder.js";
import { invalidDateRangeError } from "../utils/errors.js";

export const SAMPLE_ROWS = 50_000; // ventana de muestreo para estimar filas/día, cerca del final del índice: seek rápido
export const SAFETY_FACTOR = 3; // sobreestimar la tasa de llegada por si hubo un pico reciente

/**
 * Formatea un Date en hora LOCAL (no `.toISOString()`, que siempre da UTC).
 * Como la conexión usa `useUTC: false`, la hora local de esta máquina es la
 * que de verdad se le envía a SQL Server — mostrar UTC en los mensajes
 * confundiría al usuario con una hora que no es la que se consultó.
 */
export function formatearFechaLocal(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}

interface MaxIdRow {
  maxid: string | null;
}

interface SampleRow {
  minfecha: Date | null;
  filas: number;
}

/**
 * Estima el `idlog` a partir del cual seguro están las filas de los últimos
 * `dias` días, usando una muestra reciente para calcular filas/día. Nunca
 * puede hacer que se pierdan filas: solo acota el escaneo, `fecha` filtra
 * la corrección real.
 *
 * Written against the injected `SqlSearchClientLike` (not a raw `mssql`
 * pool) so it's unit-testable with a fake client — see `shared.test.ts`.
 */
export async function estimateIdlogFloor(client: SqlSearchClientLike, dias: number): Promise<string> {
  const maxIdResult = await client.query<MaxIdRow>(buildMaxIdlogQuery());
  const maxId = maxIdResult.recordset[0]?.maxid;
  if (!maxId) return "0";

  const sampleResult = await client.query<SampleRow>(buildSampleQuery(BigInt(maxId) - BigInt(SAMPLE_ROWS)));
  const sample = sampleResult.recordset[0];
  if (!sample?.minfecha || sample.filas === 0) return "0";

  const sampleSpanMs = Date.now() - new Date(sample.minfecha).getTime();
  const sampleSpanDays = Math.max(sampleSpanMs / 86_400_000, 1 / 24); // mínimo 1 hora, evita división por ~0
  const rowsPerDay = sample.filas / sampleSpanDays;

  const estimatedRows = BigInt(Math.ceil(rowsPerDay * dias * SAFETY_FACTOR));
  const floor = BigInt(maxId) - estimatedRows;
  return (floor < 0n ? 0n : floor).toString();
}

export interface FechaRango {
  fechaDesde: Date;
  fechaHasta: Date;
}

/**
 * Shared by `erp_fallas_resumen` (relative `dias` OR explicit `desde`,
 * `desde` wins when present) — same validation/precedence as the original
 * inline handler. Deliberately called BEFORE opening a SQL connection (see
 * `tools/erp_fallas_resumen.ts`), so a bad date fails fast without wasting a
 * connection attempt against a possibly-unreachable server.
 */
export function parseRangoRelativoOFijo(params: { dias?: number; desde?: string; hasta?: string }): FechaRango {
  const { dias, desde, hasta } = params;
  const fechaDesde = desde ? new Date(desde) : new Date(Date.now() - (dias ?? 1) * 86_400_000);
  const fechaHasta = hasta ? new Date(hasta) : new Date();
  if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
    throw invalidDateRangeError();
  }
  return { fechaDesde, fechaHasta };
}

/** Shared by `erp_fallas_rango` (explicit `desde` required, `hasta` optional). */
export function parseRangoFijo(params: { desde: string; hasta?: string }): FechaRango {
  const fechaDesde = new Date(params.desde);
  const fechaHasta = params.hasta ? new Date(params.hasta) : new Date();
  if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
    throw invalidDateRangeError();
  }
  return { fechaDesde, fechaHasta };
}

export interface AnomaliaRow {
  modulo: string;
  ubicacion: string;
  reciente: number;
  baseline: number;
  idlog_ejemplo: number | null;
}

export interface Anomalia {
  modulo: string;
  ubicacion: string;
  reciente: number;
  baseline_previo: number;
  esperado_normal: number;
  estado: string;
  idlog_ejemplo: number | null;
}

/**
 * Anomalía = pasó mucho más de lo que el promedio del baseline predice para
 * esta ventana, o no había pasado nunca antes (NUEVO). El score nunca decide
 * corrección, solo ordena — igual que idlog solo poda el escaneo en las
 * otras tools.
 */
export function computeAnomalias(
  rows: AnomaliaRow[],
  params: { horasRecientes: number; diasBaseline: number; limit: number }
): Anomalia[] {
  const { horasRecientes, diasBaseline, limit } = params;

  return rows
    .map((row) => {
      const tasaPorHora = row.baseline / (diasBaseline * 24);
      const esperado = tasaPorHora * horasRecientes;
      const esNuevo = row.baseline === 0;
      const score = esNuevo ? Number.POSITIVE_INFINITY : row.reciente / Math.max(esperado, 0.5);
      return {
        modulo: row.modulo,
        ubicacion: row.ubicacion,
        reciente: row.reciente,
        baseline_previo: row.baseline,
        esperado_normal: Math.round(esperado * 10) / 10,
        estado: esNuevo ? "NUEVO — nunca había pasado en el baseline" : `${Math.round(score * 10) / 10}x lo normal`,
        idlog_ejemplo: row.idlog_ejemplo,
        _score: score,
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}
