import { describe, expect, it } from "vitest";
import { runTool, type ToolDeps } from "./shared.js";
import { serviceNotFoundError } from "../utils/errors.js";
import type { SearchClientLike } from "../elastic/search.js";

const NOOP_CLIENT: SearchClientLike = {
  async search() {
    return { hits: { total: { value: 0, relation: "eq" } } } as never;
  },
};

function deps(extraSensitiveFields: string[] = []): ToolDeps {
  return {
    client: NOOP_CLIENT,
    traceIndex: "traces-apm-default",
    errorIndex: "logs-apm.error-default",
    extraSensitiveFields,
  };
}

describe("runTool", () => {
  it("returns the successful result, passed through sanitizeDocument (FR-19)", async () => {
    const result = await runTool(deps(), async () => ({
      service: "PuntoVentaAPI",
      requests: 10,
      authorization: "should-be-redacted",
    }));
    expect(result).toEqual({
      service: "PuntoVentaAPI",
      requests: 10,
      authorization: "[REDACTED]",
    });
  });

  it("honors an extra sensitive field configured via deps", async () => {
    const result = await runTool(deps(["internal_note"]), async () => ({
      internal_note: "secret",
      count: 1,
    }));
    expect(result).toEqual({ internal_note: "[REDACTED]", count: 1 });
  });

  it("converts a thrown typed domain error into the error envelope shape (never throws)", async () => {
    const result = await runTool(deps(), async () => {
      throw serviceNotFoundError("Typo123");
    });
    expect(result).toEqual({
      error: { code: "SERVICE_NOT_FOUND", message: expect.any(String) },
    });
  });

  it("converts an unknown thrown value to the generic fallback envelope", async () => {
    const result = await runTool(deps(), async () => {
      throw new Error("boom");
    });
    expect(result).toEqual({
      error: { code: "ELASTICSEARCH_ERROR", message: "An unexpected error occurred." },
    });
  });
});
