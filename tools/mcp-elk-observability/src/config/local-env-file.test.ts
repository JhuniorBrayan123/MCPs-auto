import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLocalEnvFile } from "./local-env-file.js";

describe("loadLocalEnvFile", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("does nothing when no .env file is present", () => {
    dir = mkdtempSync(join(tmpdir(), "elk-env-test-"));
    const env: NodeJS.ProcessEnv = {};
    loadLocalEnvFile(dir, env);
    expect(env).toEqual({});
  });

  it("loads KEY=VALUE lines, skipping comments/blank lines and stripping quotes", () => {
    dir = mkdtempSync(join(tmpdir(), "elk-env-test-"));
    writeFileSync(
      join(dir, ".env"),
      ["# a comment", "", "FOO=bar", 'QUOTED="hello world"', "MCP_TRANSPORT=streamable-http"].join("\n"),
    );
    const env: NodeJS.ProcessEnv = {};
    loadLocalEnvFile(dir, env);
    expect(env.FOO).toBe("bar");
    expect(env.QUOTED).toBe("hello world");
    expect(env.MCP_TRANSPORT).toBe("streamable-http");
  });

  it("never overrides a variable already present in the target env", () => {
    dir = mkdtempSync(join(tmpdir(), "elk-env-test-"));
    writeFileSync(join(dir, ".env"), "MCP_PORT=8013");
    const env: NodeJS.ProcessEnv = { MCP_PORT: "9999" };
    loadLocalEnvFile(dir, env);
    expect(env.MCP_PORT).toBe("9999");
  });
});
