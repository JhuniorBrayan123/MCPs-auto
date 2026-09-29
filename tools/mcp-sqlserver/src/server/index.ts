import sql from "mssql";
import z from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assertReadOnlyQuery } from "../read-only-guard.js";
import { registerMonitoringTools } from "./monitoring.js";
import { CONNECTION_NAMES } from "../connection-profiles.js";
import type { SqlConfigOverrides } from "../config/sql-config.js";

export interface ServerDeps {
  makeSqlConfig: (connection: (typeof CONNECTION_NAMES)[number], overrides?: SqlConfigOverrides) => sql.config;
}

const connectionParam = z
  .enum(CONNECTION_NAMES)
  .default("drt")
  .describe(
    "Perfil de conexión a usar: 'dev' (desarrollo), 'drt' (comprobación de recetas / CRT) o 'prd' (producción)"
  );

const overrideParams = {
  server: z.string().optional().describe("Servidor SQL (sobreescribe el perfil)"),
  database: z.string().optional().describe("Base de datos (sobreescribe el perfil)"),
  user: z.string().optional().describe("Usuario (sobreescribe el perfil)"),
  password: z.string().optional().describe("Contraseña (sobreescribe el perfil)"),
};

export function registerTools(server: McpServer, deps: ServerDeps): McpServer {
  const { makeSqlConfig } = deps;

  server.tool(
    "sqlserver_query",
    {
      connection: connectionParam,
      query: z
        .string()
        .describe(
          "Consulta de SOLO LECTURA (SELECT o WITH). Las operaciones de escritura están bloqueadas."
        ),
      limit: z.coerce.number().default(100).describe("Número máximo de filas a retornar"),
      ...overrideParams,
      timeout: z.coerce.number().optional().describe("Timeout en segundos (sobreescribe el perfil)"),
    },
    async ({
      connection,
      query,
      limit,
      server: overrideServer,
      database: overrideDatabase,
      user: overrideUser,
      password: overridePassword,
      timeout: overrideTimeout,
    }) => {
      let pool: sql.ConnectionPool | undefined;
      try {
        assertReadOnlyQuery(query);

        pool = new sql.ConnectionPool(
          makeSqlConfig(connection, {
            server: overrideServer,
            database: overrideDatabase,
            user: overrideUser,
            password: overridePassword,
            timeout: overrideTimeout,
          })
        );
        await pool.connect();

        const transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.READ_UNCOMMITTED);

        let data: unknown[];
        try {
          const result = await new sql.Request(transaction).query(query);
          data = (result.recordset || []).slice(0, limit);
        } finally {
          await transaction.rollback().catch(() => {});
        }

        return {
          content: [
            {
              type: "text",
              text: `Consulta ejecutada (conexión: ${connection}, filas: ${data.length}).\n${JSON.stringify(data, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        console.error("Error ejecutando query:", err);
        return {
          content: [{ type: "text", text: `Error executing query: ${(err as Error).message}` }],
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
    "sqlserver_get_schema",
    {
      connection: connectionParam,
      schema: z.string().optional().default("dbo").describe("Nombre del esquema"),
      ...overrideParams,
    },
    async ({
      connection,
      schema,
      server: overrideServer,
      database: overrideDatabase,
      user: overrideUser,
      password: overridePassword,
    }) => {
      let pool: sql.ConnectionPool | undefined;
      try {
        const config = makeSqlConfig(connection, {
          server: overrideServer,
          database: overrideDatabase,
          user: overrideUser,
          password: overridePassword,
        });
        pool = new sql.ConnectionPool(config);
        await pool.connect();

        const tables = await pool
          .request()
          .input("schema", sql.NVarChar, schema)
          .query(
            `SELECT TABLE_NAME, TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = @schema`
          );

        const views = await pool
          .request()
          .input("schema", sql.NVarChar, schema)
          .query(`SELECT TABLE_NAME, TABLE_SCHEMA FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = @schema`);

        const procedures = await pool
          .request()
          .input("schema", sql.NVarChar, schema)
          .query(
            `SELECT NAME, TYPE_DESC FROM SYS.OBJECTS WHERE TYPE = 'P' AND SCHEMA_ID = SCHEMA_ID(@schema)`
          );

        const database = config.database;
        return {
          content: [
            {
              type: "text",
              text: ` Esquema de base de datos: \`${database}\` (conexión: ${connection})\n\n**Tablas** (${tables.recordset.length}):\n${tables.recordset
                .map((t: any) => `- ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`)
                .join("\n")}\n\n**Vistas** (${views.recordset.length}):\n${views.recordset
                .map((v: any) => `- ${v.TABLE_SCHEMA}.${v.TABLE_NAME}`)
                .join("\n")}\n\n**Procedimientos almacenados** (${procedures.recordset.length}):\n${procedures.recordset
                .map((p: any) => `- ${p.NAME} (${p.TYPE_DESC})`)
                .join("\n")}`,
            },
          ],
        };
      } catch (err) {
        console.error("❌ Error obteniendo esquema:", err);
        return {
          content: [{ type: "text", text: ` Error getting schema: ${(err as Error).message}` }],
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
    "sqlserver_test_connection",
    {
      connection: connectionParam,
      ...overrideParams,
    },
    async ({ connection, server: overrideServer, database: overrideDatabase, user: overrideUser, password: overridePassword }) => {
      let pool: sql.ConnectionPool | undefined;
      try {
        const config = makeSqlConfig(connection, {
          server: overrideServer,
          database: overrideDatabase,
          user: overrideUser,
          password: overridePassword,
        });
        pool = new sql.ConnectionPool(config);
        await pool.connect();

        const result = await pool.request().query("SELECT @@VERSION AS Version, DB_NAME() AS DatabaseName");
        const version = result.recordset[0]?.Version ?? "Desconocido";

        return {
          content: [
            {
              type: "text",
              text: ` Conexión exitosa a SQL Server (perfil: ${connection})\nServidor: ${config.server}\nBase de datos: ${config.database}\nVersión: ${version}`,
            },
          ],
        };
      } catch (err) {
        console.error(" Error en test de conexión:", err);
        return {
          content: [
            { type: "text", text: ` Error de conexión a SQL Server (perfil: ${connection}): ${(err as Error).message}` },
          ],
          isError: true,
        };
      } finally {
        try {
          await pool?.close();
        } catch {}
      }
    }
  );

  registerMonitoringTools(server, { makeSqlConfig });

  return server;
}

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: "mcp-sqlserver", version: "1.0.0" });
  return registerTools(server, deps);
}
