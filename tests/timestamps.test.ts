import assert from "node:assert/strict";
import test from "node:test";
import { extractTimestampCandidates, extractTimestamps, formatTimestamp, parseTimestampInput } from "../lib/timestamps";

test("extracts minutes, hours, full-width forms, zero, and both ends of an explicit range", () => {
  const text = "3:24 1:02:03 90:00 ３：２４ ０：００ 3:20〜3:40";
  const mentions = extractTimestamps(text);
  assert.deepEqual(mentions.map((mention) => mention.seconds), [204, 3723, 5400, 204, 0, 200, 220]);
  for (const mention of mentions) assert.equal(text.slice(mention.start, mention.end), mention.text);
});

test("preserves the exact original offsets after emoji and compatibility-width characters", () => {
  const text = "🎬 ㍿の感想。３：２４ と 3:24、１：０２：０３";
  const mentions = extractTimestamps(text);
  assert.deepEqual(mentions.map((mention) => mention.text), ["３：２４", "3:24", "１：０２：０３"]);
  assert.equal(mentions[0].start, text.indexOf("３：２４"));
  for (const mention of mentions) assert.equal(text.slice(mention.start, mention.end), mention.text);
  assert.equal(mentions.length, 3, "duplicate seconds remain clickable in every original position");
});

test("does not pick valid substrings out of malformed or overlong number/colon runs", () => {
  for (const text of ["3:60", "1:60:03", "1:02:60", "3:2", "1:2:03", "1:02:03:04", "12345:24", "03:240", ":3:24", "3:24:", "3::24", "999999999999999999999999:00:00"]) {
    assert.deepEqual(extractTimestamps(text), [], text);
  }
  assert.deepEqual(extractTimestamps("a3:24b").map((mention) => mention.seconds), [204]);
});

test("excludes normal URLs, dates, and explicit clocks but retains ambiguous bare timestamps", () => {
  const excluded = [
    "https://example.com/3:24?t=12:30", "www.example.com/3:24", "youtube.com/watch?v=3:24",
    "https://youtu.be/video?t=3:24", "http://example.com:12:30/path", "午前3:24", "午後 12:30",
    "AM 3:24", "PM 12:30", "時刻：12:30", "時計 12:30", "現在 12:30", "12:30 PM", "12:30 JST",
    "2026/09/26 12:30", "2026-09-26T12:30", "2026年9月26日12:30", "9月26日 12:30",
  ];
  for (const text of excluded) assert.deepEqual(extractTimestamps(text), [], text);
  assert.deepEqual(extractTimestamps("12:30 が好き。3:24頃もいい").map((mention) => mention.seconds), [750, 204]);
  assert.deepEqual(extractTimestamps("https://example.com/3:24、感想は4:20").map((mention) => mention.seconds), [260]);
  assert.deepEqual(extractTimestamps("3分24秒 最後 サビ"), []);
});

test("duration is exclusive; missing, zero, and invalid durations remain unknown", () => {
  const text = "0:00 0:59 1:00 1:01";
  assert.deepEqual(extractTimestamps(text, 60).map((mention) => mention.seconds), [0, 59]);
  for (const duration of [undefined, null, 0, -1, NaN, Infinity]) assert.equal(extractTimestamps(text, duration).length, 4);
  assert.equal(extractTimestampCandidates(text).length, 4);
});

test("range inputs are validated without silently swapping, clipping, or interpreting partial text", () => {
  for (const [value, expected] of [["3:24", 204], ["1:02:03", 3723], ["90:00", 5400], ["３：２４", 204], [" ０ ", 0], ["204", 204]] as const) {
    assert.equal(parseTimestampInput(value), expected);
  }
  for (const value of ["", "3:", "1:2", "3:99", "1:60:00", "-1", "1.2", "3:24秒", "Infinity", "9999999999999999999999"]) assert.equal(parseTimestampInput(value), null, value);
  assert.equal(formatTimestamp(0), "0:00");
  assert.equal(formatTimestamp(204), "3:24");
  assert.equal(formatTimestamp(3723), "1:02:03");
  assert.equal(formatTimestamp(5400), "1:30:00");
  assert.equal(formatTimestamp(204.9), "3:24");
  assert.equal(formatTimestamp(NaN), "—");
});
