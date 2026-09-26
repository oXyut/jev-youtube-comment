import assert from "node:assert/strict";
import test from "node:test";
import { groupItems, toneForScore, type Item } from "../lib/analysis";
import { sampleItems } from "../lib/sample-data";
import { meanSentimentColor, meanSentimentColors, sentimentRingSegments } from "../lib/sentiment-display";

test("equal means retain distinct neutral and polarized distributions", () => {
  const item = (id: string, level: number): Item => ({
    ...sampleItems[0], id, gender: "masculine_coded", age: "university",
    valenceProbabilities: { [level]: 1 }, bothSidesProbability: .99,
  });
  const central = groupItems([item("n1", 2), item("n2", 2)]).find(group => group.count)!;
  const polarized = groupItems([item("p1", 0), item("p2", 4)]).find(group => group.count)!;
  assert.equal(central.meanValence, 0);
  assert.equal(polarized.meanValence, 0);
  assert.equal(meanSentimentColor(central.meanValence), meanSentimentColor(polarized.meanValence));
  assert.deepEqual(sentimentRingSegments(central.counts), [{ tone: "center", share: 100, offset: 0 }]);
  assert.deepEqual(sentimentRingSegments(polarized.counts), [
    { tone: "critical", share: 50, offset: 0 }, { tone: "positive", share: 50, offset: 50 },
  ]);
});

test("the reported 8-comment group shows 25/25/50, and every ring uses its own denominator", () => {
  const groups = groupItems(sampleItems);
  const reported = groups.find(group => group.key === "masculine_coded:university")!;
  assert.equal(reported.count, 8);
  assert.deepEqual(sentimentRingSegments(reported.counts), [
    { tone: "critical", share: 25, offset: 0 }, { tone: "center", share: 25, offset: 25 },
    { tone: "positive", share: 50, offset: 50 },
  ]);
  for (const group of groups) {
    const segments = sentimentRingSegments(group.counts);
    assert.ok(Math.abs(segments.reduce((sum, segment) => sum + segment.share, 0) - 100) < 1e-10);
    for (const segment of segments) assert.equal(segment.share, group.counts[segment.tone] / group.count * 100);
  }
  assert.deepEqual(sentimentRingSegments({ critical: 0, center: 0, positive: 0 }), []);
});

test("mean colors are continuous through category thresholds, with fixed ends and readable counts", () => {
  assert.equal(meanSentimentColor(-2), meanSentimentColors.negative);
  assert.equal(meanSentimentColor(0), meanSentimentColors.zero);
  assert.equal(meanSentimentColor(2), meanSentimentColors.positive);
  assert.equal(meanSentimentColor(-10), meanSentimentColor(-2));
  assert.equal(meanSentimentColor(10), meanSentimentColor(2));
  assert.notEqual(meanSentimentColor(.25), meanSentimentColor(.45));
  assert.notEqual(meanSentimentColor(.6), meanSentimentColor(1.8));
  for (const boundary of [-.5, 0, .5]) {
    assert.equal(meanSentimentColor(boundary - .00001), meanSentimentColor(boundary + .00001));
  }
  assert.equal(toneForScore(-.5), "center");
  assert.equal(toneForScore(.5), "center");
  for (let step = 0; step <= 400; step++) {
    const color = meanSentimentColor(-2 + step / 100);
    const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255);
    const [r, g, b] = channels.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    const luminance = .2126 * r + .7152 * g + .0722 * b;
    assert.ok((luminance + .05) / .05 >= 4.5, `black count text on ${color}`);
  }
});
