import assert from "node:assert/strict";
import test from "node:test";
import sampleGroups from "../reports/design-options-2026-09-26/revision-04/sample-groups.json";
import {
  ageLabels, ages, defaultFilters, filterItems, genderLabels, genders, groupInRange,
  groupItems, heatOf, sortItems, toneCounts, toneForScore, valenceOf, type Filters, type Item,
} from "../lib/analysis";
import { sampleItems } from "../lib/sample-data";

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

const comparisonFilters = (): Filters => ({
  ...defaultFilters(), genders: ["masculine_coded", "feminine_coded"], ageRange: [1, 3],
});

test("the deterministic demo matches the 100-comment source and all 15 group means", () => {
  assert.equal(sampleItems.length, 100);
  assert.equal(new Set(sampleItems.map((item) => item.id)).size, 100);
  assert.deepEqual(toneCounts(sampleItems), { critical: 15, center: 23, positive: 62 });
  const groups = groupItems(sampleItems);
  assert.equal(groups.length, 15);
  for (const expected of sampleGroups.groups) {
    const group = groups.find((entry) => ageLabels[entry.age] === expected.age && genderLabels[entry.gender] === expected.gender)!;
    assert.equal(group.count, expected.count);
    assert.deepEqual(group.counts, { critical: expected.critical, center: expected.center, positive: expected.positive });
    close(group.meanValence, expected.meanValence);
    const members = sampleItems.filter((item) => item.gender === group.gender && item.age === group.age);
    close(group.meanHeat, members.reduce((sum, item) => sum + heatOf(item), 0) / members.length);
  }
  assert.deepEqual(ages.map((age) => sampleItems.filter((item) => item.age === age).length), [5, 15, 25, 35, 20]);
  assert.deepEqual(genders.map((gender) => sampleItems.filter((item) => item.gender === gender).length), [32, 34, 34]);
  for (const item of sampleItems) {
    assert.match(item.authorDisplayName!, /^サンプル投稿者 /);
    assert.equal(item.authorProfileImageUrl, undefined);
    for (const probabilities of [item.valenceProbabilities, item.heatProbabilities, item.genderProbabilities, item.ageProbabilities]) {
      close(Object.values(probabilities).reduce((sum, probability) => sum + probability, 0), 1);
      assert.ok(Object.values(probabilities).every((probability) => probability >= 0 && probability <= 1));
    }
  }
});

test("the shared comparison filters yield 52 comments and the selected group yields 14", () => {
  const filters = comparisonFilters();
  const filtered = filterItems(sampleItems, filters);
  assert.equal(filtered.length, 52);
  assert.deepEqual(toneCounts(filtered), { critical: 9, center: 10, positive: 33 });
  assert.deepEqual(ages.slice(1, 4).map((age) => filtered.filter((item) => item.age === age).length), [10, 17, 25]);
  const selected = filterItems(sampleItems, { ...filters, genders: ["feminine_coded"], ageRange: [3, 3] });
  assert.equal(selected.length, 14);
  assert.deepEqual(toneCounts(selected), { critical: 1, center: 2, positive: 11 });
  close(groupItems(selected).find((group) => group.count)!.meanValence, 0.95);
  assert.deepEqual(filters, comparisonFilters(), "drill-down must not mutate the comparison filters");
});

test("the central band includes both -0.5 and +0.5", () => {
  assert.equal(toneForScore(-0.500001), "critical");
  for (const value of [-0.5, -0.1, 0, 0.1, 0.5]) assert.equal(toneForScore(value), "center");
  assert.equal(toneForScore(0.500001), "positive");
});

test("gender OR, age inclusive AND, empty selection, and same-category intervals", () => {
  const filters = defaultFilters();
  assert.equal(filterItems(sampleItems, filters).length, 100);
  assert.equal(filterItems(sampleItems, { ...filters, genders: [] }).length, 0);
  assert.equal(filterItems(sampleItems, { ...filters, genders: ["masculine_coded", "feminine_coded"] }).length, 66);
  assert.equal(filterItems(sampleItems, { ...filters, ageRange: [1, 3] }).length, 75);
  assert.equal(filterItems(sampleItems, { ...filters, ageRange: [2, 2] }).length, 25);
  assert.equal(filterItems(sampleItems, { ...filters, genders: ["masculine_coded"], ageRange: [2, 2] }).length, 8);
  assert.equal(filterItems(sampleItems, { ...filters, ageRange: [3, 1] }).length, 0);
});

test("search, tone, heat, and mixture filters all intersect demographic selection", () => {
  const item: Item = {
    ...sampleItems[0], text: "Sample match", gender: "feminine_coded", age: "working_adult",
    valenceProbabilities: { 2: 0.9, 3: 0.1 }, heatProbabilities: { 1: 0.5, 2: 0.5 }, bothSidesProbability: 0.5,
  };
  const items = [item, { ...item, id: "other-gender", gender: "ambiguous" }, { ...item, id: "other-age", age: "middle_older" }];
  const filters: Filters = { ...comparisonFilters(), search: "  sAMPLE  ", tone: "center", heatRange: [1.5, 1.5] };
  assert.deepEqual(filterItems(items, filters).map((entry) => entry.id), [item.id]);
  assert.equal(filterItems(items, { ...filters, tone: "positive" }).length, 0);
  assert.equal(filterItems(items, { ...filters, search: "missing" }).length, 0);
  assert.equal(filterItems(items, { ...filters, heatRange: [0, 1.4] }).length, 0);
  assert.equal(filterItems(items, { ...filters, tone: "both" }).length, 1);
  assert.equal(filterItems([{ ...item, bothSidesProbability: 0.4999 }], { ...filters, tone: "both" }).length, 0);
  assert.equal(filterItems([{ ...item, bothSidesProbability: null }], { ...filters, tone: "both" }).length, 0);
});

test("empty and excluded groups retain distinct range status without stale totals", () => {
  const filters = comparisonFilters();
  const emptyGroups = groupItems([]);
  assert.equal(emptyGroups.length, 15);
  assert.equal(new Set(emptyGroups.map((group) => group.key)).size, 15);
  assert.equal(emptyGroups.filter((group) => groupInRange(group, filters)).length, 6);
  assert.ok(emptyGroups.every((group) => group.count === 0 && group.meanValence === 0 && group.meanHeat === 0));
  assert.ok(emptyGroups.every((group) => Object.values(group.counts).every((count) => count === 0)));
  const groups = groupItems(filterItems(sampleItems, filters));
  assert.ok(groups.filter((group) => !groupInRange(group, filters)).every((group) => group.count === 0));
  assert.equal(groupInRange({ gender: "feminine_coded", age: "unknown" }, defaultFilters()), false);
});

test("every sort option preserves membership and input order, with stable ties", () => {
  const low: Item = {
    ...sampleItems[0], id: "low", likeCount: 1, publishedAt: "2026-09-01T00:00:00Z",
    valenceProbabilities: { 0: 0.8, 4: 0.2 }, heatProbabilities: { 0: 0.8, 4: 0.2 },
    genderProbabilities: { feminine_coded: 0.2 }, ageProbabilities: { university: 0.2 }, bothSidesProbability: 0.2,
  };
  const high: Item = {
    ...low, id: "high", likeCount: 4, publishedAt: "2026-09-02T00:00:00Z",
    valenceProbabilities: { 0: 0.2, 4: 0.8 }, heatProbabilities: { 0: 0.2, 4: 0.8 },
    genderProbabilities: { feminine_coded: 0.8 }, ageProbabilities: { university: 0.8 }, bothSidesProbability: 0.8,
  };
  const items = Object.freeze([low, high]);
  for (const key of ["likes", "newest", "valence", "heat", "valence:4", "heat:4", "gender:feminine_coded", "age:university", "bothSides", "bothSides:"]) {
    assert.deepEqual(sortItems(items, key, "desc").map((item) => item.id), ["high", "low"], key);
    assert.deepEqual(sortItems(items, key, "asc").map((item) => item.id), ["low", "high"], key);
  }
  for (const key of ["valence:0", "heat:0"]) assert.deepEqual(sortItems(items, key, "desc").map((item) => item.id), ["low", "high"]);
  assert.deepEqual(items.map((item) => item.id), ["low", "high"]);
  assert.deepEqual(sortItems(items, "unknown", "desc"), items);
  assert.deepEqual(toneCounts(sortItems(sampleItems, "likes", "desc")), toneCounts(sampleItems));
  close(valenceOf(low), -1.2);
  close(heatOf(high), 3.2);
});

test("default filters return independent mutable arrays", () => {
  const first = defaultFilters();
  first.genders.length = 0;
  first.ageRange[0] = 4;
  first.heatRange[0] = 4;
  assert.deepEqual(defaultFilters(), { genders: [...genders], ageRange: [0, 4], search: "", tone: "all", heatRange: [0, 4] });
});
