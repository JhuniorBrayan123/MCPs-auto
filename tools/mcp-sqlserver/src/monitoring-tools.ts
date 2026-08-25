
import sql from "mssql";
import z from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONNECTION_NAMES, type ConnectionName } from "./connection-profiles.js";

type MakeSqlConfig = (connection: ConnectionName) => sql.config;

const SAMPLE_ROWS = 50_000; // ventana de muestreo para estimar filas/día, cerca del final del índice: seek rápido
const SAFETY_FACTOR = 3; // sobreestimar la tasa de llegada por si hubo un pico reciente

/**
 * Formatea un Date en hora LOCAL (no `.toISOString()`, que siempre da UTC).
 * Como la conexión usa `useUTC: false`, la hora local de esta máquina es la
 * que de verdad se le envía a SQL Server — mostrar UTC en los mensajes
 * confundiría al usuario con una hora que no es la que se consultó.
 */
function formatearFechaLocal(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}

/**
 * Estima el `idlog` a partir del cual seguro están las filas de los últimos
 * `dias` días, usando una muestra reciente para calcular filas/día. Nunca
 * puede hacer que se pierdan filas: solo acota el escaneo, `fecha` filtra
 * la corrección real.
 */
async function estimateIdlogFloor(pool: sql.ConnectionPool, dias: number): Promise<string> {
  const maxIdResult = await pool.request().query<{ maxid: string | null }>(
    "SELECT MAX(idlog) AS maxid FROM dbo.log"
  );
  const maxId = maxIdResult.recordset[0]?.maxid;
  if (!maxId) return "0";

  const sampleResult = await pool
    .request()
    .input("floor", sql.BigInt, BigInt(maxId) - BigInt(SAMPLE_ROWS))
    .query<{ minfecha: Date | null; filas: number }>(
      "SELECT MIN(fecha) AS minfecha, COUNT(*) AS filas FROM dbo.log WHERE idlog >= @floor"
    );
  const sample = sampleResult.recordset[0];
  if (!sample?.minfecha || sample.filas === 0) return "0";

  const sampleSpanMs = Date.now() - new Date(sample.minfecha).getTime();
  const sampleSpanDays = Math.max(sampleSpanMs / 86_400_000, 1 / 24); // mínimo 1 hora, evita división por ~0
  const rowsPerDay = sample.filas / sampleSpanDays;

  const estimatedRows = BigInt(Math.ceil(rowsPerDay * dias * SAFETY_FACTOR));
  const floor = BigInt(maxId) - estimatedRows;
  return (floor < 0n ? 0n : floor).toString();
}

/**
 * Recibe la TRANSACCIÓN, no un `Request` ya armado — así cada tool puede
 * crear tantos `new sql.Request(transaction)` como necesite (ej. un conteo
 * y luego el detalle). Reutilizar un mismo `Request` para varias llamadas
 * a `.query()` no es un comportamiento garantizado de node-mssql.
 */
async function withReadOnlyTransaction<T>(
  pool: sql.ConnectionPool,
  run: (transaction: sql.Transaction) => Promise<T>
): Promise<T> {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_UNCOMMITTED);
  try {
    return await run(transaction);
  } finally {
    await transaction.rollback().catch(() => {});
  }
}

export function registerMonitoringTools(server: McpServer, makeSqlConfig: MakeSqlConfig) {
  const connectionParam = z
    .enum(CONNECTION_NAMES)
    .default("drt")
    .describe("Perfil de conexión: 'dev' (desarrollo), 'drt' (SRExcepcion / CRT) o 'prd' (producción)");
  const diasParam = z
    .coerce.number()
    .min(1)
    .max(90)
    .default(1)
    .describe("Cuántos días hacia atrás desde ahora (máximo 90)");

  server.tool(
    "erp_fallas_resumen",
    {
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
    },
    async ({ connection, dias, desde, hasta }) => {
      let pool: sql.ConnectionPool | undefined;
      try {
        // Dos modos: rango explícito (desde/hasta) o relativo (dias, default 1).
        // 'desde' manda si está presente — es más específico que 'dias'.
        const fechaDesde = desde ? new Date(desde) : new Date(Date.now() - (dias ?? 1) * 86_400_000);
        const fechaHasta = hasta ? new Date(hasta) : new Date();
        if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
          throw new Error("`desde`/`hasta` no son fechas válidas. Usa formato ISO, ej: '2026-08-25T10:00:00'.");
        }

        pool = new sql.ConnectionPool(makeSqlConfig(connection));
        await pool.connect();

        const diasParaFloor = Math.max((Date.now() - fechaDesde.getTime()) / 86_400_000, 1 / 24);
        const idlogFloor = await estimateIdlogFloor(pool, diasParaFloor);

        const result = await withReadOnlyTransaction(pool, (transaction) =>
          new sql.Request(transaction)
            .input("idlogFloor", sql.BigInt, BigInt(idlogFloor))
            .input("desde", sql.DateTime, fechaDesde)
            .input("hasta", sql.DateTime, fechaHasta)
            .query(`
              SELECT m.descripcion AS modulo, lv.descripcion AS nivel, COUNT(*) AS cantidad
              FROM dbo.log l
              JOIN dbo.tipo t ON t.idtipo = l.idtipo
              JOIN dbo.modulo m ON m.idmodulo = t.idmodulo
              JOIN dbo.level lv ON lv.idlevel = l.idlevel
              WHERE l.idlog >= @idlogFloor AND l.fecha BETWEEN @desde AND @hasta
              GROUP BY m.descripcion, lv.descripcion
              ORDER BY cantidad DESC
            `)
        );

        const etiquetaRango = desde
          ? `entre ${formatearFechaLocal(fechaDesde)} y ${formatearFechaLocal(fechaHasta)}`
          : `últimos ${dias ?? 1} día(s)`;

        return {
          content: [
            {
              type: "text",
              text: `📊 Resumen de fallas — ${etiquetaRango} (conexión: ${connection})\n${JSON.stringify(result.recordset, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${(err as Error).message}` }],
          isError: true,
        };
      } finally {
        try {
          await pool?.close();
        } catch {}
      }
    }
  );

  server.tool(
    "erp_fallas_por_modulo",
    {
      connection: connectionParam,
      dias: diasParam,
      modulo: z.string().describe("Nombre del módulo tal como aparece en erp_fallas_resumen (ej: 'mscontabilidad')"),
      limit: z.coerce.number().default(20).describe("Máximo de firmas de error distintas a devolver"),
    },
    async ({ connection, dias, modulo, limit }) => {
      let pool: sql.ConnectionPool | undefined;
      try {
        pool = new sql.ConnectionPool(makeSqlConfig(connection));
        await pool.connect();

        const idlogFloor = await estimateIdlogFloor(pool, dias);

        const result = await withReadOnlyTransaction(pool, (transaction) =>
          new sql.Request(transaction)
            .input("idlogFloor", sql.BigInt, BigInt(idlogFloor))
            .input("desde", sql.DateTime, new Date(Date.now() - dias * 86_400_000))
            .input("modulo", sql.VarChar, modulo)
            .input("limit", sql.Int, limit)
            .query(`
              SELECT TOP (@limit)
                t.descripcion AS tipo,
                lv.descripcion AS nivel,
                COUNT(*) AS cantidad,
                MIN(l.fecha) AS primera_vez,
                MAX(l.fecha) AS ultima_vez,
                MAX(l.idlog) AS idlog_ejemplo -- pásalo a erp_falla_detalle para ver el mensaje y la traza completos
              FROM dbo.log l
              JOIN dbo.tipo t ON t.idtipo = l.idtipo
              JOIN dbo.modulo m ON m.idmodulo = t.idmodulo
              JOIN dbo.level lv ON lv.idlevel = l.idlevel
              WHERE l.idlog >= @idlogFloor
                AND l.fecha >= @desde
                AND m.descripcion = @modulo
              GROUP BY t.descripcion, lv.descripcion
              ORDER BY cantidad DESC
            `)
        );

        return {
          content: [
            {
              type: "text",
              text: `📊 Fallas en '${modulo}' — últimos ${dias} día(s) (conexión: ${connection})\n${JSON.stringify(result.recordset, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${(err as Error).message}` }],
          isError: true,
        };
      } finally {
        try {
          await pool?.close();
        } catch {}
      }
    }
  );

  server.tool(
    "erp_falla_detalle",
    {
      connection: connectionParam,
      idlog: z
        .coerce.number()
        .describe("idlog exacto de la fila (lo entrega erp_fallas_por_modulo como 'idlog_ejemplo')"),
    },
    async ({ connection, idlog }) => {
      let pool: sql.ConnectionPool | undefined;
      try {
        pool = new sql.ConnectionPool(makeSqlConfig(connection));
        await pool.connect();

        // Un solo idlog = seek directo por la PK clustered, instantáneo
        // aunque no exista índice en fecha.
        const result = await withReadOnlyTransaction(pool, (transaction) =>
          new sql.Request(transaction).input("idlog", sql.BigInt, idlog).query(`
              SELECT
                l.idlog,
                l.fecha,
                m.descripcion AS modulo,
                t.descripcion AS tipo,
                lv.descripcion AS nivel,
                l.usuario,
                CAST(l.ubicacion AS VARCHAR(MAX)) AS ubicacion,
                CAST(l.mensaje AS VARCHAR(MAX)) AS mensaje,
                CAST(l.traza AS VARCHAR(MAX)) AS traza
              FROM dbo.log l
              JOIN dbo.tipo t ON t.idtipo = l.idtipo
              JOIN dbo.modulo m ON m.idmodulo = t.idmodulo
              JOIN dbo.level lv ON lv.idlevel = l.idlevel
              WHERE l.idlog = @idlog
            `)
        );

        if (result.recordset.length === 0) {
          return {
            content: [{ type: "text", text: `No existe ninguna fila con idlog=${idlog}.` }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `🔍 Detalle de idlog=${idlog} (conexión: ${connection})\n${JSON.stringify(result.recordset[0], null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${(err as Error).message}` }],
          isError: true,
        };
      } finally {
        try {
          await pool?.close();
        } catch {}
      }
    }
  );

  server.tool(
    "erp_anomalias",
    {
      connection: connectionParam,
      horasRecientes: z
        .coerce.number()
        .min(1)
        .max(72)
        .default(24)
        .describe("Ventana 'reciente' a analizar, en horas"),
      diasBaseline: z
        .coerce.number()
        .min(1)
        .max(30)
        .default(7)
        .describe("Cuántos días previos a la ventana reciente se usan como referencia de 'lo normal'"),
      limit: z.coerce.number().default(15).describe("Máximo de anomalías a devolver"),
    },
    async ({ connection, horasRecientes, diasBaseline, limit }) => {
      let pool: sql.ConnectionPool | undefined;
      try {
        pool = new sql.ConnectionPool(makeSqlConfig(connection));
        await pool.connect();

        const diasTotal = horasRecientes / 24 + diasBaseline;
        const idlogFloor = await estimateIdlogFloor(pool, diasTotal);
        const corteReciente = new Date(Date.now() - horasRecientes * 3_600_000);
        const inicioBaseline = new Date(Date.now() - diasTotal * 86_400_000);

        // Agrupa por `ubicacion` (el punto exacto del código que lanzó el
        // error), no por `tipo`: muchos tipos son "Excepción Genérica" y
        // mezclan causas completamente distintas bajo el mismo balde.
        const result = await withReadOnlyTransaction(pool, (transaction) =>
          new sql.Request(transaction)
            .input("idlogFloor", sql.BigInt, BigInt(idlogFloor))
            .input("inicioBaseline", sql.DateTime, inicioBaseline)
            .input("corteReciente", sql.DateTime, corteReciente)
            .query(`
              SELECT
                m.descripcion AS modulo,
                CAST(l.ubicacion AS VARCHAR(300)) AS ubicacion,
                SUM(CASE WHEN l.fecha >= @corteReciente THEN 1 ELSE 0 END) AS reciente,
                SUM(CASE WHEN l.fecha < @corteReciente THEN 1 ELSE 0 END) AS baseline,
                MAX(CASE WHEN l.fecha >= @corteReciente THEN l.idlog END) AS idlog_ejemplo
              FROM dbo.log l
              JOIN dbo.tipo t ON t.idtipo = l.idtipo
              JOIN dbo.modulo m ON m.idmodulo = t.idmodulo
              WHERE l.idlog >= @idlogFloor AND l.fecha >= @inicioBaseline
              GROUP BY m.descripcion, CAST(l.ubicacion AS VARCHAR(300))
              HAVING SUM(CASE WHEN l.fecha >= @corteReciente THEN 1 ELSE 0 END) > 0
            `)
        );

        // Anomalía = pasó mucho más de lo que el promedio del baseline
        // predice para esta ventana, o no había pasado nunca antes (NUEVO).
        // El score nunca decide corrección, solo ordena — igual que idlog
        // solo poda el escaneo en las otras tools.
        const anomalias = result.recordset
          .map((row: any) => {
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

        return {
          content: [
            {
              type: "text",
              text: `🚨 Anomalías — últimas ${horasRecientes}h vs. promedio de los ${diasBaseline} días previos (conexión: ${connection})\nOrdenado de más a menos anómalo. Usa idlog_ejemplo con erp_falla_detalle para ver el mensaje completo.\n${JSON.stringify(anomalias, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${(err as Error).message}` }],
          isError: true,
        };
      } finally {
        try {
          await pool?.close();
        } catch {}
      }
    }
  );

  server.tool(
    "erp_fallas_rango",
    {
      connection: connectionParam,
      desde: z
        .string()
        .describe("Inicio del rango, fecha y hora (ej: '2026-08-25T10:00:00'). Interpretada en hora del servidor."),
      hasta: z
        .string()
        .optional()
        .describe("Fin del rango, fecha y hora. Si se omite, usa el momento actual."),
      modulo: z.string().optional().describe("Filtrar solo por este módulo (opcional)"),
      limit: z
        .coerce.number()
        .max(100)
        .default(50)
        .describe("Máximo de filas a devolver (tope 100 — si necesitas ver más, filtra por módulo o acorta el rango)"),
    },
    async ({ connection, desde, hasta, modulo, limit }) => {
      let pool: sql.ConnectionPool | undefined;
      try {
        const fechaDesde = new Date(desde);
        const fechaHasta = hasta ? new Date(hasta) : new Date();
        if (Number.isNaN(fechaDesde.getTime()) || Number.isNaN(fechaHasta.getTime())) {
          throw new Error("`desde`/`hasta` no son fechas válidas. Usa formato ISO, ej: '2026-08-25T10:00:00'.");
        }

        pool = new sql.ConnectionPool(makeSqlConfig(connection));
        await pool.connect();

        // Mismo atajo de idlog que las demás tools: acota por cuántos días
        // atrás cae `desde`, luego `fecha` decide el rango exacto de verdad.
        const diasDesdeAhora = Math.max((Date.now() - fechaDesde.getTime()) / 86_400_000, 1 / 24);
        const idlogFloor = await estimateIdlogFloor(pool, diasDesdeAhora);

        const { total, filas } = await withReadOnlyTransaction(pool, async (transaction) => {
          // Dos Request separados (no uno reutilizado) para el conteo y el
          // detalle — cada uno recibe sus propios inputs.
          const requestConteo = new sql.Request(transaction)
            .input("idlogFloor", sql.BigInt, BigInt(idlogFloor))
            .input("desde", sql.DateTime, fechaDesde)
            .input("hasta", sql.DateTime, fechaHasta);
          if (modulo) requestConteo.input("modulo", sql.VarChar, modulo);

          // Conteo primero: si hay muchas más filas que el límite, hay que
          // avisarlo en vez de devolver las primeras N en silencio — con
          // ruido crónico (ver erp_anomalias) esto puede ser miles de filas.
          const conteo = await requestConteo.query(`
              SELECT COUNT(*) AS total
              FROM dbo.log l
              JOIN dbo.tipo t ON t.idtipo = l.idtipo
              JOIN dbo.modulo m ON m.idmodulo = t.idmodulo
              WHERE l.idlog >= @idlogFloor
                AND l.fecha BETWEEN @desde AND @hasta
                ${modulo ? "AND m.descripcion = @modulo" : ""}
            `);

          const requestDetalle = new sql.Request(transaction)
            .input("idlogFloor", sql.BigInt, BigInt(idlogFloor))
            .input("desde", sql.DateTime, fechaDesde)
            .input("hasta", sql.DateTime, fechaHasta)
            .input("limit", sql.Int, limit);
          if (modulo) requestDetalle.input("modulo", sql.VarChar, modulo);

          const detalle = await requestDetalle.query(`
              SELECT TOP (@limit)
                l.idlog,
                l.fecha,
                m.descripcion AS modulo,
                t.descripcion AS tipo,
                lv.descripcion AS nivel,
                l.usuario,
                LEFT(CAST(l.mensaje AS VARCHAR(MAX)), 80) AS mensaje_resumido
              FROM dbo.log l
              JOIN dbo.tipo t ON t.idtipo = l.idtipo
              JOIN dbo.modulo m ON m.idmodulo = t.idmodulo
              JOIN dbo.level lv ON lv.idlevel = l.idlevel
              WHERE l.idlog >= @idlogFloor
                AND l.fecha BETWEEN @desde AND @hasta
                ${modulo ? "AND m.descripcion = @modulo" : ""}
              ORDER BY l.fecha
            `);

          return { total: conteo.recordset[0].total as number, filas: detalle.recordset };
        });

        const avisoTope =
          total > limit
            ? `\n⚠️ Hay ${total} filas en total en este rango, se muestran solo las primeras ${limit}. Filtra por 'modulo', acorta el rango, o usa erp_fallas_por_modulo / erp_anomalias para un resumen en vez del detalle fila por fila.`
            : "";

        return {
          content: [
            {
              type: "text",
              text: `🕐 Fallas entre ${formatearFechaLocal(fechaDesde)} y ${formatearFechaLocal(fechaHasta)} (conexión: ${connection}${modulo ? `, módulo: ${modulo}` : ""})\nTotal en el rango: ${total}. Mostrando: ${filas.length}.${avisoTope}\nUsa 'idlog' con erp_falla_detalle para ver el mensaje y la traza completos de una fila puntual.\n${JSON.stringify(filas, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Error: ${(err as Error).message}` }],
          isError: true,
        };
      } finally {
        try {
          await pool?.close();
        } catch {}
      }
    }
  );
}
