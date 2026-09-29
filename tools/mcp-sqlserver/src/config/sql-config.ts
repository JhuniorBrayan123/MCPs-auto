import z from "zod";
import type sql from "mssql";
import { CONNECTION_NAMES, type ConnectionName } from "../connection-profiles.js";

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

export type ConnectionProfile = z.infer<typeof profileSchema>;
export type ConnectionProfiles = Record<ConnectionName, ConnectionProfile>;

type EnvSource = Record<string, string | undefined>;

function loadProfile(env: EnvSource, name: Uppercase<ConnectionName>): ConnectionProfile {
  return profileSchema.parse({
    server: env[`SQLSERVER_${name}_SERVER`],
    port: env[`SQLSERVER_${name}_PORT`] || undefined,
    database: env[`SQLSERVER_${name}_DATABASE`],
    user: env[`SQLSERVER_${name}_USER`],
    password: env[`SQLSERVER_${name}_PASSWORD`],
    timeout: env[`SQLSERVER_${name}_TIMEOUT`],
    encrypt: env[`SQLSERVER_${name}_ENCRYPT`],
  });
}

export function loadConnectionProfiles(env: EnvSource = process.env): ConnectionProfiles {
  return {
    dev: loadProfile(env, "DEV"),
    drt: loadProfile(env, "DRT"),
    prd: loadProfile(env, "PRD"),
  };
}

export interface SqlConfigOverrides {
  server?: string;
  database?: string;
  user?: string;
  password?: string;
  timeout?: number;
}

export function createMakeSqlConfig(profiles: ConnectionProfiles) {
  return function makeSqlConfig(connection: ConnectionName, overrides?: SqlConfigOverrides): sql.config {
    const profile = profiles[connection];
    return {
      server: overrides?.server ?? profile.server,
      ...(profile.port ? { port: profile.port } : {}),
      database: overrides?.database ?? profile.database,
      user: overrides?.user ?? profile.user,
      password: overrides?.password ?? profile.password,
      connectionTimeout: (overrides?.timeout ?? profile.timeout) * 1000,
      requestTimeout: (overrides?.timeout ?? profile.timeout) * 1000,
      options: {
        encrypt: profile.encrypt,
        trustServerCertificate: true,
        useUTC: false,
      },
    };
  };
}

export function describeProfiles(profiles: ConnectionProfiles): string {
  return CONNECTION_NAMES.map((name) => `${name} (${profiles[name].database || "sin database"})`).join(", ");
}
