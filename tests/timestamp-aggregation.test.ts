import assert from "node:assert/strict";
import test from "node:test";
import { type Item } from "../lib/analysis";
import { sampleItems } from "../lib/sample-data";
import { aggregateBins, buildTimestampIndex, MAX_TIMESTAMP_BINS, summarizeRange, timestampLineSegments, timestampToneOf } from "../lib/timestamp-aggregation";

function item(id: string, text: string, valenceProbabilities: Record<string, number> = { 4: 1 }): Item {
  return { ...sampleItems[0], id, text, valenceProbabilities };
}

test("index deduplicates IDs and same seconds, with unique excluded out-of-duration candidates", () => {
  const first = item("one", "0:00 0:10 0:10 1:00 2:00 2:00");
  const { entries, excludedCount } = buildTimestampIndex([first, first, item("two", "2:00"), item("none", "text")], 120);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].mentions.map((mention) => mention.seconds), [0, 10, 60]);
  assert.equal(excludedCount, 2);
  assert.equal(buildTimestampIndex([first]).excludedCount, 0);
});

test("bins count each comment ID once even with multiple mentions and preserve empty intervals", () => {
  const { entries } = buildTimestampIndex([
    item("one", "0:00 0:10 0:20 1:00"), item("two", "0:15"), item("three", "2:00"),
  ]);
  const bins = aggregateBins(entries, 30, 135);
  assert.deepEqual(bins.map((bin) => bin.total), [2, 0, 1, 0, 1]);
  assert.equal(bins.reduce((sum, bin) => sum + bin.total, 0), 4);
  assert.equal(summarizeRange(entries, null).total, 3);
  assert.deepEqual(bins.map(({ startSeconds, endSeconds, midpointSeconds }) => [startSeconds, endSeconds, midpointSeconds]), [
    [0, 30, 15], [30, 60, 45], [60, 90, 75], [90, 120, 105], [120, 135, 127.5],
  ]);
  assert.deepEqual(bins[1].percentages, { positive: null, center: null, critical: null, unknown: null });
});

test("arbitrary ranges select original mentions with exclusive end, independently of bin width", () => {
  const { entries } = buildTimestampIndex([
    item("before", "29:17"), item("cross", "29:18 29:50 30:00"), item("boundary", "30:00"),
    item("inside", "30:11"), item("end", "30:12"),
  ]);
  const range = { startSeconds: 29 * 60 + 18, endSeconds: 30 * 60 + 12 };
  assert.deepEqual(summarizeRange(entries, range).items.map((entry) => entry.id), ["cross", "boundary", "inside"]);
  assert.deepEqual(summarizeRange(entries, { startSeconds: 29 * 60 + 30, endSeconds: 30 * 60 }).items.map((entry) => entry.id), ["cross"]);
  for (const width of [30, 60, 120]) {
    aggregateBins(entries, width, 49 * 60 + 24);
    assert.equal(summarizeRange(entries, range).total, 3);
  }
  assert.equal(summarizeRange(entries, { startSeconds: 20, endSeconds: 10 }).total, 0);
});

test("sorting uses the first mention inside the selected range, with stable ID tie breaks", () => {
  const { entries } = buildTimestampIndex([
    item("z", "0:01 1:20"), item("b", "1:10 1:40"), item("a", "1:10"), item("c", "1:15"),
  ]);
  assert.deepEqual(summarizeRange(entries, null).items.map((entry) => entry.id), ["z", "a", "b", "c"]);
  assert.deepEqual(summarizeRange(entries, { startSeconds: 60, endSeconds: 120 }).items.map((entry) => entry.id), ["a", "b", "c", "z"]);
});

test("the sentiment boundaries retain central -0.5 and +0.5 and distinguish unacquired probabilities", () => {
  assert.equal(timestampToneOf(item("low", "0:00", { 1: .5, 2: .5 })), "center");
  assert.equal(timestampToneOf(item("high", "0:00", { 2: .5, 3: .5 })), "center");
  assert.equal(timestampToneOf(item("positive", "0:00", { 2: .49, 3: .51 })), "positive");
  assert.equal(timestampToneOf(item("critical", "0:00", { 1: .51, 2: .49 })), "critical");
  assert.equal(timestampToneOf(item("zero", "0:00", { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 })), "unknown");
  assert.equal(timestampToneOf(item("empty", "0:00", {})), "unknown");
  assert.equal(timestampToneOf(item("unrecognized", "0:00", { other: 1 })), "unknown");
});

test("shares use all unique comments including unknown, with null distinct from genuine zero", () => {
  const { entries } = buildTimestampIndex([
    item("positive", "0:01"), item("center", "0:02", { 2: 1 }), item("unknown", "0:03 0:04", {}),
    item("only-unknown", "1:00", {}),
  ]);
  const bins = aggregateBins(entries, 30, 90);
  assert.deepEqual(bins[0].counts, { positive: 1, center: 1, critical: 0, unknown: 1 });
  for (const tone of ["positive", "center", "unknown"] as const) {
    assert.ok(Math.abs(bins[0].percentages[tone]! - 100 / 3) < 1e-10);
  }
  assert.equal(bins[0].percentages.critical, 0);
  assert.equal(bins[1].percentages.critical, null);
  assert.equal(bins[2].total, 1);
  assert.deepEqual(bins[2].percentages, { positive: null, center: null, critical: null, unknown: 100 });
});

test("line runs never bridge empty or entirely unknown bins, and retain isolated points", () => {
  const { entries } = buildTimestampIndex([
    item("first", "0:05"), item("next", "0:35"), item("unknown", "1:30", {}), item("last", "2:00"),
  ]);
  const bins = aggregateBins(entries, 30, 150);
  assert.deepEqual(timestampLineSegments(bins, "positive").map((segment) => segment.map((bin) => bin.startSeconds)), [[0, 30], [120]]);
  assert.deepEqual(timestampLineSegments(bins, "critical").map((segment) => segment.map((bin) => bin.percentages.critical)), [[0, 0], [0]]);
});

test("unconfirmed extreme times cannot allocate excessive bins and the timestamp list remains available", () => {
  const { entries } = buildTimestampIndex([item("extreme", "999999:00:00")]);
  assert.equal(summarizeRange(entries, null).total, 1);
  assert.deepEqual(aggregateBins(entries, 30, 999999 * 3600 + 30), []);
  assert.equal(aggregateBins([], 30, MAX_TIMESTAMP_BINS * 30).length, MAX_TIMESTAMP_BINS);
  for (const [width, end] of [[0, 100], [-1, 100], [NaN, 100], [30, Infinity], [30, 0]]) assert.deepEqual(aggregateBins([], width, end), []);
});
