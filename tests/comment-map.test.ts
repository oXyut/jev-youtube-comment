import assert from "node:assert/strict";
import test from "node:test";
import { likeBubbleRadius } from "../lib/comment-map";

test("bubble area follows likes with a shared scale", () => {
  const quarter = likeBubbleRadius(25, 100);
  const full = likeBubbleRadius(100, 100);
  assert.equal(quarter ** 2 / full ** 2, 0.25);
  assert.equal(full, 15);
  assert.ok(likeBubbleRadius(10, 100) < quarter);
});

test("zero likes and extreme outliers retain visible, bounded bubbles", () => {
  assert.equal(likeBubbleRadius(0, 0), 3);
  assert.equal(likeBubbleRadius(0, 100), 3);
  assert.equal(likeBubbleRadius(1, 1_000_000), 3);
  assert.equal(likeBubbleRadius(-1, 100), 3);
  assert.equal(likeBubbleRadius(200, 100), 15);
});
