import sql from "mssql";
import type { SqlQuerySpec } from "./search.js";

/**
 * Builds the exact parameterized queries the 5 `SRExcepcion` monitoring
 * tools run — copied verbatim from the original inline `monitoring-tools.ts`.
 * Every value goes through `.input()`, never string interpolation, so SQL
 * injection is impossible by construction (no allowlist needed, unlike
 * ELK's period parser).
 */

export function buildMaxIdlogQuery(): SqlQuerySpec {
  return { text: "SELECT MAX(idlog) AS maxid FROM dbo.log" };
}

export function buildSampleQuery(floor: bigint): SqlQuerySpec {
  return {
    text: "SELECT MIN(fecha) AS minfecha, COUNT(*) AS filas FROM dbo.log WHERE idlog >= @floor",
    inputs: [{ name: "floor", type: sql.BigInt, value: floor }],
  };
}

export function buildResumenQuery(params: {
  idlogFloor: bigint;
  desde: Date;
  hasta: Date;
}): SqlQuerySpec {
  return {
    text: `
      SELECT m.descripcion AS modulo, lv.descripcion AS nivel, COUNT(*) AS cantidad
      FROM dbo.log l
      JOIN dbo.tipo t ON t.idtipo = l.idtipo
      JOIN dbo.modulo m ON m.idmodulo = t.idmodulo
      JOIN dbo.level lv ON lv.idlevel = l.idlevel
      WHERE l.idlog >= @idlogFloor AND l.fecha BETWEEN @desde AND @hasta
      GROUP BY m.descripcion, lv.descripcion
      ORDER BY cantidad DESC
    `,
    inputs: [
      { name: "idlogFloor", type: sql.BigInt, value: params.idlogFloor },
      { name: "desde", type: sql.DateTime, value: params.desde },
      { name: "hasta", type: sql.DateTime, value: params.hasta },
    ],
  };
}

export function buildPorModuloQuery(params: {
  idlogFloor: bigint;
  desde: Date;
  modulo: string;
  limit: number;
}): SqlQuerySpec {
  return {
    text: `
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
    `,
    inputs: [
      { name: "idlogFloor", type: sql.BigInt, value: params.idlogFloor },
      { name: "desde", type: sql.DateTime, value: params.desde },
      { name: "modulo", type: sql.VarChar, value: params.modulo },
      { name: "limit", type: sql.Int, value: params.limit },
    ],
  };
}

export function buildDetalleQuery(idlog: number): SqlQuerySpec {
  return {
    text: `
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
    `,
    inputs: [{ name: "idlog", type: sql.BigInt, value: idlog }],
  };
}

export function buildAnomaliasQuery(params: {
  idlogFloor: bigint;
  inicioBaseline: Date;
  corteReciente: Date;
}): SqlQuerySpec {
  return {
    // Agrupa por `ubicacion` (el punto exacto del código que lanzó el
    // error), no por `tipo`: muchos tipos son "Excepción Genérica" y
    // mezclan causas completamente distintas bajo el mismo balde.
    text: `
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
    `,
    inputs: [
      { name: "idlogFloor", type: sql.BigInt, value: params.idlogFloor },
      { name: "inicioBaseline", type: sql.DateTime, value: params.inicioBaseline },
      { name: "corteReciente", type: sql.DateTime, value: params.corteReciente },
    ],
  };
}

export function buildRangoConteoQuery(params: {
  idlogFloor: bigint;
  desde: Date;
  hasta: Date;
  modulo?: string;
}): SqlQuerySpec {
  const inputs: SqlQuerySpec["inputs"] = [
    { name: "idlogFloor", type: sql.BigInt, value: params.idlogFloor },
    { name: "desde", type: sql.DateTime, value: params.desde },
    { name: "hasta", type: sql.DateTime, value: params.hasta },
  ];
  if (params.modulo) inputs!.push({ name: "modulo", type: sql.VarChar, value: params.modulo });

  return {
    text: `
      SELECT COUNT(*) AS total
      FROM dbo.log l
      JOIN dbo.tipo t ON t.idtipo = l.idtipo
      JOIN dbo.modulo m ON m.idmodulo = t.idmodulo
      WHERE l.idlog >= @idlogFloor
        AND l.fecha BETWEEN @desde AND @hasta
        ${params.modulo ? "AND m.descripcion = @modulo" : ""}
    `,
    inputs,
  };
}

export function buildRangoDetalleQuery(params: {
  idlogFloor: bigint;
  desde: Date;
  hasta: Date;
  modulo?: string;
  limit: number;
}): SqlQuerySpec {
  const inputs: SqlQuerySpec["inputs"] = [
    { name: "idlogFloor", type: sql.BigInt, value: params.idlogFloor },
    { name: "desde", type: sql.DateTime, value: params.desde },
    { name: "hasta", type: sql.DateTime, value: params.hasta },
    { name: "limit", type: sql.Int, value: params.limit },
  ];
  if (params.modulo) inputs!.push({ name: "modulo", type: sql.VarChar, value: params.modulo });

  return {
    text: `
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
        ${params.modulo ? "AND m.descripcion = @modulo" : ""}
      ORDER BY l.fecha
    `,
    inputs,
  };
}
