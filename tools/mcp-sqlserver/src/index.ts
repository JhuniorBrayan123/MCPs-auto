import dotenv from "dotenv";
import z from "zod";
import sql from "mssql";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertReadOnlyQuery } from "./read-only-guard.js";
import { registerMonitoringTools } from "./server/monitoring.js";
import { CONNECTION_NAMES, type ConnectionName } from "./connection-profiles.js";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  console.error(` No se pudo cargar .env desde ${envPath}: ${dotenvResult.error.message}`);
}


const profileSchema = z.object({
  server: z.string().default("localhost"),
  
  port: z.coerce.number().optional(),
  database: z.string().default(""),
  user: z.string().default(""),
  password: z.string().default(""),
  timeout: z.coerce.number().default(30),

  encrypt: z
    .string()
    .optional()
    .transform((value) => value?.toLowerCase() === "true")
    .pipe(z.boolean()),
});

function loadProfile(name: Uppercase<ConnectionName>) {
  return profileSchema.parse({
    server: process.env[`SQLSERVER_${name}_SERVER`],
    port: process.env[`SQLSERVER_${name}_PORT`] || undefined,
    database: process.env[`SQLSERVER_${name}_DATABASE`],
    user: process.env[`SQLSERVER_${name}_USER`],
    password: process.env[`SQLSERVER_${name}_PASSWORD`],
    timeout: process.env[`SQLSERVER_${name}_TIMEOUT`],
    encrypt: process.env[`SQLSERVER_${name}_ENCRYPT`],
  });
}

const profiles: Record<ConnectionName, z.infer<typeof profileSchema>> = {
  dev: loadProfile("DEV"),
  drt: loadProfile("DRT"),
  prd: loadProfile("PRD"),
};

function makeSqlConfig(
  connection: ConnectionName,
  overrides?: {
    server?: string;
    database?: string;
    user?: string;
    password?: string;
    timeout?: number;
  }
): sql.config {
  const profile = profiles[connection];
  return {
    server: overrides?.server ?? profile.server,
    ...(profile.port ? { port: profile.port } : {}),
    database: overrides?.database ?? profile.database,
    user: overrides?.user ?? profile.user,
    password: overrides?.password ?? profile.password,
    // El mismo valor cubre ambos tiempos: establecer la conexión y ejecutar la
    // consulta. `requestTimeout` es el que realmente importa en consultas de
    // agregación sobre tablas de log grandes (el default de node-mssql es 15s).
    connectionTimeout: (overrides?.timeout ?? profile.timeout) * 1000,
    requestTimeout: (overrides?.timeout ?? profile.timeout) * 1000,
    options: {
      encrypt: profile.encrypt, // true para Azure SQL
      trustServerCertificate: true, // Necesario con certificado autofirmado
      // CRÍTICO: `datetime` en SQL Server no tiene zona horaria — es un valor
      // "naive". Por default, tedious convierte los `Date` de JS a UTC antes
      // de enviarlos, y como esta máquina/el servidor están en UTC-5, eso
      // desfasaba cualquier filtro por hora exacta 5 horas hacia adelante
      // (verificado: pedir "08:00–12:00" llegaba a SQL Server como
      // "13:00–17:00", perdiendo/agregando filas en silencio). Con
      // useUTC:false, tedious manda la hora LOCAL del objeto Date tal cual,
      // que es justamente la hora del servidor (confirmado con SYSDATETIME()
      // vs GETUTCDATE(): ambos en UTC-5).
      useUTC: false,
    },
  };
}


const server = new McpServer({
  name: "mcp-sqlserver",
  version: "1.0.0",
});

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

server.tool(
  "sqlserver_query",
  {
    connection: connectionParam,
    query: z
      .string()
      .describe(
        "Consulta de SOLO LECTURA (SELECT o WITH). Las operaciones de escritura están bloqueadas."
      ),
    limit: z
      .coerce.number()
      .default(100)
      .describe("Número máximo de filas a retornar"),
    ...overrideParams,
    timeout: z.coerce.number().optional().describe("Timeout en segundos (sobreescribe el perfil)"),
  },
  async ({ connection, query, limit, server: overrideServer, database: overrideDatabase, user: overrideUser, password: overridePassword, timeout: overrideTimeout }) => {
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
        content: [
          {
            type: "text",
            text: `Error executing query: ${(err as Error).message}`,
          },
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

server.tool(
  "sqlserver_get_schema",
  {
    connection: connectionParam,
    schema: z.string().optional().default("dbo").describe("Nombre del esquema"),
    ...overrideParams,
  },
  async ({ connection, schema, server: overrideServer, database: overrideDatabase, user: overrideUser, password: overridePassword }) => {
    let pool: sql.ConnectionPool | undefined;
    try {
      pool = new sql.ConnectionPool(
        makeSqlConfig(connection, {
          server: overrideServer,
          database: overrideDatabase,
          user: overrideUser,
          password: overridePassword,
        })
      );
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

      const database = overrideDatabase ?? profiles[connection].database;
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
        content: [
          {
            type: "text",
            text: ` Error getting schema: ${(err as Error).message}`,
          },
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


server.tool(
  "sqlserver_test_connection",
  {
    connection: connectionParam,
    ...overrideParams,
  },
  async ({ connection, server: overrideServer, database: overrideDatabase, user: overrideUser, password: overridePassword }) => {
    let pool: sql.ConnectionPool | undefined;
    try {
      pool = new sql.ConnectionPool(
        makeSqlConfig(connection, {
          server: overrideServer,
          database: overrideDatabase,
          user: overrideUser,
          password: overridePassword,
        })
      );
      await pool.connect();

      const result = await pool.request().query("SELECT @@VERSION AS Version, DB_NAME() AS DatabaseName");
      const version = result.recordset[0]?.Version ?? "Desconocido";
      const database = overrideDatabase ?? profiles[connection].database;

      return {
        content: [
          {
            type: "text",
            text: ` Conexión exitosa a SQL Server (perfil: ${connection})\nServidor: ${overrideServer ?? profiles[connection].server}\nBase de datos: ${database}\nVersión: ${version}`,
          },
        ],
      };
    } catch (err) {
      console.error(" Error en test de conexión:", err);
      return {
        content: [
          {
            type: "text",
            text: ` Error de conexión a SQL Server (perfil: ${connection}): ${(err as Error).message}`,
          },
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


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(" MCP SQL Server corriendo (stdio)");
  console.error(
    `   Perfiles disponibles: ${CONNECTION_NAMES.map(
      (name) => `${name} (${profiles[name].database || "sin database"})`
    ).join(", ")}`
  );
}

main().catch((err) => {
  console.error("Error starting MCP server:", err);
  process.exit(1);
});
