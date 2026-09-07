import { describe, expect, it } from "vitest";
import * as traceRequestTool from "./trace_request.js";
import * as getTraceDependenciesTool from "./get_trace_dependencies.js";
import { fakeSearchClientFromDocs } from "../../test/helpers/fake-search-client.js";
import traceDocs from "../../test/fixtures/trace.json";
import type { ToolDeps } from "./shared.js";
import type { SearchClientLike } from "../elastic/search.js";

const TRACE_INDEX = "traces-apm-default";
const ERROR_INDEX = "logs-apm.error-default";
const TRACE_ID = "4f5dcb1a1b1bde0fdb9a130a85544498";

function deps(client: SearchClientLike): ToolDeps {
  return { client, traceIndex: TRACE_INDEX, errorIndex: ERROR_INDEX, extraSensitiveFields: [] };
}

describe("trace_request tool", () => {
  it("requires trace_id", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    await expect(traceRequestTool.execute({}, deps(client))).rejects.toThrow();
  });

  it("reconstructs the transaction and chronologically-ordered spans", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    const result = await traceRequestTool.execute({ trace_id: TRACE_ID }, deps(client));
    const success = result as { trace_id: string; spans: { name: string }[] };
    expect(success.trace_id).toBe(TRACE_ID);
    expect(success.spans.map((s) => s.name)).toEqual(["SAVE", "SELECT", "GET", "GET /api/x"]);
  });

  it("returns TRACE_NOT_FOUND as an error envelope, never throwing", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    const result = await traceRequestTool.execute({ trace_id: "does-not-exist" }, deps(client));
    expect(result).toEqual({ error: { code: "TRACE_NOT_FOUND", message: expect.any(String) } });
  });
});

describe("get_trace_dependencies tool", () => {
  it("requires trace_id", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    await expect(getTraceDependenciesTool.execute({}, deps(client))).rejects.toThrow();
  });

  it("groups dependencies and always includes the caveat field", async () => {
    const client = fakeSearchClientFromDocs(traceDocs as Record<string, unknown>[]);
    const result = await getTraceDependenciesTool.execute(
      { trace_id: TRACE_ID },
      deps(client),
    );
    const success = result as { dependencies: unknown[]; caveat: string };
    expect(success.dependencies.length).toBeGreaterThan(0);
    expect(typeof success.caveat).toBe("string");
    expect(success.caveat.length).toBeGreaterThan(0);
  });
});
