import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  ArchiveValidationError, createAnalysisArchive, parseAnalysisArchive, parseAnalysisSaveInput,
  type AnalysisArchive, type AnalysisSaveInput,
} from "../lib/analysis-archive";
import { analysisStoreErrorResponse, AnalysisStoreError, createAnalysisStore } from "../lib/analysis-store";
import { sampleItems, sampleVideo } from "../lib/sample-data";
import { POST } from "../app/api/analyses/route";
import { GET as loadRoute } from "../app/api/analyses/[id]/route";

function input(): AnalysisSaveInput {
  return {
    video: { ...sampleVideo, thumbnail: "https://example.test/video.jpg" },
    items: sampleItems.slice(0, 3).map((item) => ({ ...item, authorProfileImageUrl: "https://example.test/avatar.jpg" })),
    analysis: {
      source: "jev", status: "complete", scope: "first100", order: "relevance", includeReplies: false,
      startedAt: "2026-09-26T10:00:00.000Z", completedAt: "2026-09-26T10:00:03.000Z",
      processed: 3, total: 3, failures: 0, elapsedSeconds: 3,
      usage: { inputTokens: 300, outputTokens: 30, estimatedCostUsd: 0.0000126 },
      analyzer: {
        provider: "typesafe.ai", model: "jev-latest", definitionVersion: 1, definitionHash: "a".repeat(64),
        appVersion: "0.1.0", gitCommit: "b".repeat(40),
      },
    },
  };
}
function archive(): AnalysisArchive {
  return createAnalysisArchive(input(), { id: "0c77c5a4-e625-49e3-bb26-c5d7d90a87f1", savedAt: "2026-09-26T10:00:04.000Z" });
}
async function temporaryDirectory(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jev-analysis-archive-"));
  context.after(async () => { await rm(directory, { recursive: true, force: true }); });
  return directory;
}

test("archive JSON round-trip retains text, results, provenance and removes external image URLs", () => {
  const original = input();
  const stored = createAnalysisArchive(original, { id: randomUUID(), savedAt: new Date().toISOString() });
  const parsed = parseAnalysisArchive(JSON.parse(JSON.stringify(stored)));
  assert.deepEqual(parsed, stored);
  assert.deepEqual(parsed.analysis, original.analysis);
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].text, original.items[0].text);
  assert.equal(parsed.items[0].authorDisplayName, original.items[0].authorDisplayName);
  assert.equal(parsed.items[0].authorProfileImageUrl, undefined);
  assert.equal(parsed.video.thumbnail, undefined);
  assert.equal(original.items[0].authorProfileImageUrl, "https://example.test/avatar.jpg", "parsing must not mutate source data");
  assert.equal(original.video.thumbnail, "https://example.test/video.jpg");
  const imported = { ...stored, video: { ...stored.video, thumbnail: "https://example.test/imported.jpg" }, items: stored.items.map((item) => ({ ...item, authorProfileImageUrl: "https://example.test/imported-avatar.jpg" })) };
  assert.ok(!JSON.stringify(parseAnalysisArchive(imported)).includes("https://example.test"));
});

test("only schema v1 determines compatibility; git commit and app version remain provenance", () => {
  const value = archive();
  value.analysis.analyzer.gitCommit = "d".repeat(40);
  value.analysis.analyzer.appVersion = "99.0.0";
  assert.equal(parseAnalysisArchive(value).analysis.analyzer.appVersion, "99.0.0");
  assert.throws(() => parseAnalysisArchive({ ...value, schemaVersion: 2 }), /未対応の保存形式/);
  assert.throws(() => parseAnalysisArchive({ ...value, schemaVersion: "1" }), /未対応の保存形式/);
  assert.throws(() => parseAnalysisArchive({ ...value, format: "other-application" }), /このアプリの分析保存/);
});

test("partial successes and all-zero unavailable distributions are valid", () => {
  const value = input();
  value.analysis = { ...value.analysis, status: "partial", completedAt: null, processed: 5, total: 10, failures: 2 };
  value.items[0] = {
    ...value.items[0], genderProbability: 0, ageProbability: 0,
    genderProbabilities: { masculine_coded: 0, feminine_coded: 0, ambiguous: 0 },
    ageProbabilities: { pre_elementary: 0, middle_high_school: 0, university: 0, working_adult: 0, middle_older: 0 },
    valenceProbabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, heatProbabilities: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
    valenceConfidence: null, heatConfidence: null, bothSidesProbability: null,
  };
  assert.equal(parseAnalysisSaveInput(value).analysis.status, "partial");
  const sample = input();
  sample.analysis = { ...sample.analysis, source: "sample", startedAt: null, completedAt: null };
  sample.analysis.analyzer.definitionHash = null;
  sample.analysis.analyzer.gitCommit = null;
  assert.equal(parseAnalysisSaveInput(sample).analysis.startedAt, null);
});

test("unknown fields and credentials are not copied into an archive", () => {
  const value = input();
  const unsafe = {
    ...value, apiKey: "do-not-save", arbitraryPath: "/private/file", video: { ...value.video, apiKey: "do-not-save" },
    items: value.items.map((item) => ({ ...item, TYPESAFE_API_KEY: "do-not-save" })),
    analysis: { ...value.analysis, secret: "do-not-save", analyzer: { ...value.analysis.analyzer, token: "do-not-save" } },
  };
  assert.ok(!JSON.stringify(parseAnalysisSaveInput(unsafe)).includes("do-not-save"));
  assert.ok(!JSON.stringify(parseAnalysisSaveInput(unsafe)).includes("/private/file"));
});

const invalidCases: [string, (value: AnalysisSaveInput) => void][] = [
  ["empty result", (value) => { value.items = []; }],
  ["duplicate ids", (value) => { value.items[1].id = value.items[0].id; }],
  ["unknown gender", (value) => { value.items[0].gender = "unknown"; }],
  ["unknown age", (value) => { value.items[0].age = "unknown"; }],
  ["invalid timestamp", (value) => { value.items[0].publishedAt = "2026-02-30T00:00:00Z"; }],
  ["missing timestamp", (value) => { value.items[0].publishedAt = ""; }],
  ["negative likes", (value) => { value.items[0].likeCount = -1; }],
  ["missing probability stage", (value) => { value.items[0].heatProbabilities = { 0: 1 }; }],
  ["unknown probability stage", (value) => { value.items[0].heatProbabilities = { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0, unexpected: 0 }; }],
  ["non-finite probability", (value) => { value.items[0].valenceProbabilities = { 0: NaN, 1: 0, 2: 0, 3: 0, 4: 1 }; }],
  ["probability outside range", (value) => { value.items[0].bothSidesProbability = 1.1; }],
  ["unnormalized distribution", (value) => { value.items[0].valenceProbabilities = { 0: 0.1, 1: 0.1, 2: 0.1, 3: 0.1, 4: 0.1 }; }],
  ["selected probability mismatch", (value) => { value.items[0].genderProbability = 0.9; }],
  ["processed count mismatch", (value) => { value.analysis.processed = 4; }],
  ["completed before finishing", (value) => { value.analysis.total = 5; }],
  ["completion before start", (value) => { value.analysis.completedAt = "2026-09-25T00:00:00Z"; }],
  ["infinite duration", (value) => { value.analysis.elapsedSeconds = Infinity; }],
  ["negative usage", (value) => { value.analysis.usage.inputTokens = -1; }],
  ["invalid definition hash", (value) => { value.analysis.analyzer.definitionHash = "not-a-hash"; }],
];
for (const [name, mutate] of invalidCases) {
  test(`invalid archive input is rejected: ${name}`, () => {
    const value = structuredClone(input());
    mutate(value);
    assert.throws(() => parseAnalysisSaveInput(value), ArchiveValidationError);
  });
}

test("persisted archives survive a new store instance with server-generated identity and save time", async (context) => {
  const directory = await temporaryDirectory(context);
  const store = createAnalysisStore(directory);
  const before = Date.now();
  const saved = await store.save({ ...input(), id: "client-chosen", savedAt: "2000-01-01T00:00:00Z" });
  assert.notEqual(saved.id, "client-chosen");
  assert.ok(Date.parse(saved.savedAt) >= before && Date.parse(saved.savedAt) <= Date.now());
  assert.deepEqual(await readdir(directory), [`${saved.id}.json`], "atomic save leaves no temporary files");
  const diskText = await readFile(path.join(directory, `${saved.id}.json`), "utf8");
  assert.ok(!diskText.includes("https://example.test"));
  assert.deepEqual(await createAnalysisStore(directory).load(saved.id), saved);
  const listed = await createAnalysisStore(directory).list();
  assert.equal(listed.skippedCount, 0);
  assert.equal(listed.analyses[0].itemCount, 3);
  assert.deepEqual(listed.analyses[0].analysis, saved.analysis);
});

test("parallel saves receive unique UUID files and descending save-time history", async (context) => {
  const directory = await temporaryDirectory(context);
  const store = createAnalysisStore(directory);
  const saved = await Promise.all(Array.from({ length: 6 }, () => store.save(input())));
  assert.equal(new Set(saved.map((value) => value.id)).size, 6);
  assert.equal((await readdir(directory)).length, 6);
  const oldest = saved[0];
  oldest.savedAt = "2000-01-01T00:00:00.000Z";
  await writeFile(path.join(directory, `${oldest.id}.json`), JSON.stringify(oldest));
  const listed = await store.list();
  assert.equal(listed.analyses.length, 6);
  assert.equal(listed.analyses.at(-1)!.id, oldest.id);
  assert.ok(listed.analyses.every((value, index) => index === 0 || Date.parse(listed.analyses[index - 1].savedAt) >= Date.parse(value.savedAt)));
});

test("one corrupted file or unsupported version does not hide valid history", async (context) => {
  const directory = await temporaryDirectory(context);
  const store = createAnalysisStore(directory);
  const valid = await store.save(input());
  const corruptedId = randomUUID();
  const unsupportedId = randomUUID();
  const mismatchedId = randomUUID();
  await writeFile(path.join(directory, `${corruptedId}.json`), "{broken");
  await writeFile(path.join(directory, `${unsupportedId}.json`), JSON.stringify({ ...valid, id: unsupportedId, schemaVersion: 42 }));
  await writeFile(path.join(directory, `${mismatchedId}.json`), JSON.stringify(valid));
  await writeFile(path.join(directory, ".pending.tmp"), "partial data");
  const listed = await store.list();
  assert.deepEqual(listed.analyses.map((entry) => entry.id), [valid.id]);
  assert.equal(listed.skippedCount, 3);
  await assert.rejects(store.load(corruptedId), (error: unknown) => error instanceof AnalysisStoreError && error.status === 400);
  await assert.rejects(store.load(unsupportedId), /未対応の保存形式/);
  await assert.rejects(store.load(mismatchedId), /IDが一致しません/);
});

test("invalid IDs, missing files, symbolic links and empty saves cannot read or write arbitrary paths", async (context) => {
  const directory = await temporaryDirectory(context);
  const store = createAnalysisStore(path.join(directory, "archives"));
  assert.deepEqual(await store.list(), { analyses: [], skippedCount: 0 });
  await assert.rejects(store.save({ ...input(), items: [] }), ArchiveValidationError);
  assert.deepEqual(await readdir(directory), []);
  await assert.rejects(store.load("../../private-file"), ArchiveValidationError);
  await assert.rejects(store.load(randomUUID()), (error: unknown) => error instanceof AnalysisStoreError && error.status === 404);
  const valid = await store.save(input());
  const linkId = randomUUID();
  await symlink(path.join(directory, "archives", `${valid.id}.json`), path.join(directory, "archives", `${linkId}.json`));
  await assert.rejects(store.load(linkId), (error: unknown) => error instanceof AnalysisStoreError && error.status === 404);
  assert.equal((await store.list()).analyses.length, 1);
});

test("archive routes return Japanese errors for invalid JSON, invalid schema and path traversal before any file access", async () => {
  const invalidJson = await POST(new Request("http://localhost/api/analyses", { method: "POST", body: "{broken" }));
  assert.equal(invalidJson.status, 400);
  assert.match((await invalidJson.json()).error, /JSONの形式/);
  const empty = await POST(new Request("http://localhost/api/analyses", { method: "POST", body: "null" }));
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /オブジェクトが必要/);
  const invalidId = await loadRoute(new Request("http://localhost/api/analyses/invalid"), { params: Promise.resolve({ id: "../../private-file" }) });
  assert.equal(invalidId.status, 400);
  assert.match((await invalidId.json()).error, /保存IDの形式/);
  assert.equal(analysisStoreErrorResponse(new AnalysisStoreError("保存データがありません。", 404)).status, 404);
  const unexpected = analysisStoreErrorResponse(new Error("private path or token"));
  assert.equal(unexpected.status, 500);
  assert.ok(!(await unexpected.text()).includes("private path or token"));
});
