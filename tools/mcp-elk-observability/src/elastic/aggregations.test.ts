import { describe, expect, it } from "vitest";
import {
  PERCENTS,
  buildDurationSubAggregations,
  buildTransactionNameAggregation,
  buildServiceNameAggregation,
} from "./aggregations.js";

describe("buildDurationSubAggregations", () => {
  it("produces percentiles/avg/max sub-aggregations for the given duration field", () => {
    const subAggs = buildDurationSubAggregations("transaction.duration.us");

    expect(subAggs.latency_percentiles).toEqual({
      percentiles: { field: "transaction.duration.us", percents: PERCENTS },
    });
    expect(subAggs.latency_avg).toEqual({ avg: { field: "transaction.duration.us" } });
    expect(subAggs.latency_max).toEqual({ max: { field: "transaction.duration.us" } });
  });

  it("uses percents exactly [50, 75, 90, 95, 99]", () => {
    expect(PERCENTS).toEqual([50, 75, 90, 95, 99]);
  });

  it("supports a span-level duration field just as well", () => {
    const subAggs = buildDurationSubAggregations("span.duration.us");
    expect(subAggs.latency_percentiles).toEqual({
      percentiles: { field: "span.duration.us", percents: PERCENTS },
    });
  });
});

describe("buildTransactionNameAggregation", () => {
  it("builds a terms aggregation keyed on transaction.name with duration sub-aggregations", () => {
    const agg = buildTransactionNameAggregation({ size: 20 });

    expect(agg.terms).toEqual({ field: "transaction.name", size: 20 });
    expect(agg.aggs?.latency_percentiles).toEqual({
      percentiles: { field: "transaction.duration.us", percents: PERCENTS },
    });
    expect(agg.aggs?.latency_avg).toEqual({ avg: { field: "transaction.duration.us" } });
    expect(agg.aggs?.latency_max).toEqual({ max: { field: "transaction.duration.us" } });
  });

  it("honors a custom duration field and size", () => {
    const agg = buildTransactionNameAggregation({
      size: 100,
      durationField: "span.duration.us",
    });
    expect(agg.terms).toEqual({ field: "transaction.name", size: 100 });
    expect(agg.aggs?.latency_avg).toEqual({ avg: { field: "span.duration.us" } });
  });
});

describe("buildServiceNameAggregation", () => {
  it("builds a terms aggregation keyed on service.name with duration sub-aggregations", () => {
    const agg = buildServiceNameAggregation({ size: 10 });

    expect(agg.terms).toEqual({ field: "service.name", size: 10 });
    expect(agg.aggs?.latency_percentiles).toEqual({
      percentiles: { field: "transaction.duration.us", percents: PERCENTS },
    });
    expect(agg.aggs?.latency_avg).toEqual({ avg: { field: "transaction.duration.us" } });
    expect(agg.aggs?.latency_max).toEqual({ max: { field: "transaction.duration.us" } });
  });

  it("honors a custom duration field and size", () => {
    const agg = buildServiceNameAggregation({
      size: 100,
      durationField: "span.duration.us",
    });
    expect(agg.terms).toEqual({ field: "service.name", size: 100 });
    expect(agg.aggs?.latency_max).toEqual({ max: { field: "span.duration.us" } });
  });
});
