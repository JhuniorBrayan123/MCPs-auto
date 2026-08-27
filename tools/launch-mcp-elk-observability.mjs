#!/usr/bin/env node
// Lanza mcp-elk-observability (submódulo externo, gitlab.sreasons.com/GP-Devops)
// inyectando el .env centralizado en la RAÍZ de MCPs antes de arrancarlo.
//
// mcp-elk-observability no trae dotenv ni lógica de carga de .env propia
// (lee directo de process.env) — a diferencia de mcp-sqlserver/mcp-bookstack,
// que sí cargan el .env de la raíz por código. Como es un repo externo, este
// wrapper resuelve lo mismo por fuera, sin tocar ni divergir del submódulo.
//
// Si el proceso que nos lanzó (Claude Code, OpenCode, una shell con export)
// ya trae una variable seteada, esa gana sobre el .env de la raíz.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const fromRootEnv = parseEnvFile(resolve(root, ".env"));
const env = { ...fromRootEnv, ...process.env };

const entrypoint = resolve(here, "mcp-elk-observability", "dist", "main.js");
const child = spawn(process.execPath, [entrypoint], { env, stdio: "inherit" });

child.on("error", (err) => {
  console.error(`No se pudo lanzar mcp-elk-observability: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
