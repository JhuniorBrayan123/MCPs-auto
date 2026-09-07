import { describe, expect, it } from "vitest";
import { loadEnv, EnvValidationError } from "./env.js";

const baseValidEnv = {
  ELASTICSEARCH_URL: "https://example.es.region.cloud.es.io:443",
  ELASTICSEARCH_API_KEY: "some-api-key",
};

describe("loadEnv", () => {
  it("throws EnvValidationError when ELASTICSEARCH_URL is missing", () => {
    const env = { ELASTICSEARCH_API_KEY: "key" };
    expect(() => loadEnv(env)).toThrow(EnvValidationError);
  });

  it("throws EnvValidationError when ELASTICSEARCH_API_KEY is missing", () => {
    const env = { ELASTICSEARCH_URL: "https://example.es.region.cloud.es.io:443" };
    expect(() => loadEnv(env)).toThrow(EnvValidationError);
  });

  it("throws EnvValidationError listing both missing vars when both are absent", () => {
    try {
      loadEnv({});
      throw new Error("expected loadEnv to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const validationError = err as EnvValidationError;
      expect(validationError.missing).toEqual([
        "ELASTICSEARCH_URL",
        "ELASTICSEARCH_API_KEY",
      ]);
    }
  });

  it("applies documented defaults for APM_TRACE_INDEX and APM_ERROR_INDEX when unset", () => {
    const config = loadEnv(baseValidEnv);
    expect(config.apmTraceIndex).toBe("traces-apm-default");
    expect(config.apmErrorIndex).toBe("logs-apm.error-default");
  });

  it("honors explicit APM_TRACE_INDEX and APM_ERROR_INDEX overrides", () => {
    const config = loadEnv({
      ...baseValidEnv,
      APM_TRACE_INDEX: "custom-traces",
      APM_ERROR_INDEX: "custom-errors",
    });
    expect(config.apmTraceIndex).toBe("custom-traces");
    expect(config.apmErrorIndex).toBe("custom-errors");
  });

  it("parses EXTRA_SENSITIVE_FIELDS into a string array", () => {
    const config = loadEnv({
      ...baseValidEnv,
      EXTRA_SENSITIVE_FIELDS: "field.one,field.two, field.three",
    });
    expect(config.extraSensitiveFields).toEqual([
      "field.one",
      "field.two",
      "field.three",
    ]);
  });

  it("defaults EXTRA_SENSITIVE_FIELDS to an empty array when unset", () => {
    const config = loadEnv(baseValidEnv);
    expect(config.extraSensitiveFields).toEqual([]);
  });

  it("parses DEBUG=true into boolean true", () => {
    const config = loadEnv({ ...baseValidEnv, DEBUG: "true" });
    expect(config.debug).toBe(true);
  });

  it("defaults DEBUG to false when unset", () => {
    const config = loadEnv(baseValidEnv);
    expect(config.debug).toBe(false);
  });

  it("parses DEBUG=false explicitly into boolean false", () => {
    const config = loadEnv({ ...baseValidEnv, DEBUG: "false" });
    expect(config.debug).toBe(false);
  });

  it("passes through elasticsearchUrl and elasticsearchApiKey unchanged", () => {
    const config = loadEnv(baseValidEnv);
    expect(config.elasticsearchUrl).toBe(baseValidEnv.ELASTICSEARCH_URL);
    expect(config.elasticsearchApiKey).toBe(baseValidEnv.ELASTICSEARCH_API_KEY);
  });
});
