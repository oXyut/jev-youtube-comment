import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "../app/api/classify/route";
import { classifyComment, getAnalyzerMetadata } from "../lib/jev";
import type { Item } from "../lib/analysis";
import { parseAnalysisSaveInput, type AnalysisMetadata } from "../lib/analysis-archive";
import { heatStages, valenceStages } from "../lib/scales";
import packageInfo from "../package.json";
import type { CommentScope } from "../lib/comment-scope";

type Usage = { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
type StreamEvent = {
  type: string; phase?: string; message?: string; id?: string; item?: Item;
  processed?: number; total?: number; sourceTotal?: number; failures?: number;
  elapsedMs?: number; classifyElapsedMs?: number; usage?: Usage;
  startedAt?: string; completedAt?: string; analyzer?: AnalysisMetadata["analyzer"];
};

function environment(context: TestContext, values: Record<string, string | undefined> = {}) {
  const replacements = { TYPESAFE_API_KEY: "test-typesafe-key", YOUTUBE_DATA_API_KEY: "test-youtube-key", ...values };
  for (const [key, value] of Object.entries(replacements)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    context.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

function request(scope?: "first100" | "all" | CommentScope) {
  return new NextRequest("http://localhost/api/classify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://www.youtube.com/watch?v=example1234", ...(typeof scope === "object" ? scope : scope ? { scope } : {}) }),
  });
}

for (const { selection, available, expected, pages } of [
  { selection: { scope: "count", limit: 1 }, available: 250, expected: 1, pages: [1] },
  { selection: { scope: "count", limit: 137 }, available: 250, expected: 137, pages: [100, 37] },
  { selection: { scope: "count", limit: 200 }, available: 250, expected: 200, pages: [100, 100] },
  { selection: { scope: "count", limit: 500 }, available: 105, expected: 105, pages: [100, 100] },
  { selection: { scope: "percentage", percentage: 10, basisCount: 1234 }, available: 250, expected: 124, pages: [100, 24] },
  { selection: { scope: "percentage", percentage: 10, basisCount: 50 }, available: 50, expected: 5, pages: [5] },
  { selection: { scope: "percentage", percentage: 100, basisCount: 105 }, available: 250, expected: 105, pages: [100, 5] },
  { selection: { scope: "all" }, available: 250, expected: 250, pages: [100, 100, 100] },
] satisfies { selection: CommentScope; available: number; expected: number; pages: number[] }[]) {
  test(`bounded API work for ${JSON.stringify(selection)} with ${available} available comments`, async (context) => {
    environment(context);
    const sizes: number[] = [];
    let classifications = 0;
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "www.googleapis.com") {
        const offset = Number(url.searchParams.get("pageToken") ?? 0);
        const size = Number(url.searchParams.get("maxResults"));
        sizes.push(size);
        const length = Math.min(size, available - offset);
        return Response.json({ items: Array.from({ length }, (_, index) => youtubeThread(offset + index + 1)),
          pageInfo: { totalResults: available }, ...(offset + length < available ? { nextPageToken: String(offset + length) } : {}) });
      }
      assert.equal(url.href, "https://api.typesafe.ai/v1/systemone");
      classifications++;
      return Response.json(classification(1));
    });
    const response = await POST(request(selection));
    const events = eventsFromText(await response.text());
    assert.deepEqual(sizes, pages);
    assert.equal(classifications, expected);
    assert.equal(events.find(event => event.type === "start")!.total, expected);
    assert.equal(events.filter(event => event.type === "item").length, expected);
    assert.equal(events.at(-1)!.type, "complete");
    assert.equal(events.at(-1)!.processed, expected);
  });
}

function youtubeThread(index: number) {
  return { snippet: { topLevelComment: { id: `comment-${index}`, snippet: {
    textDisplay: `コメント ${index}`, publishedAt: "2026-09-25T00:00:00Z", likeCount: index,
    authorDisplayName: `投稿者 ${index}`, authorProfileImageUrl: `https://example.test/avatar-${index}.jpg`,
    authorChannelId: { value: `author-${index}` },
  } } } };
}

function classification(index: number) {
  return {
    answers: {
      valence: { probabilities: { 0: 4, 1: 8, 2: 38, 3: 24, 4: 26 }, confidence: 0.84 },
      heat: { probabilities: { 0: 20, 1: 41, 2: 30, 3: 7, 4: 2 }, confidence: 0.79 },
      gender: { choice: "feminine_coded", probabilities: { masculine_coded: 0.1, feminine_coded: 0.7, ambiguous: 0.2 } },
      age: { choice: "working_adult", probabilities: { pre_elementary: 0.02, middle_high_school: 0.08, university: 0.15, working_adult: 0.6, middle_older: 0.15 } },
      both_sides: { noul: 0.67 },
    },
    usage: { input_tokens: index * 10, output_tokens: index },
  };
}

function eventsFromText(text: string): StreamEvent[] {
  assert.ok(text.endsWith("\n"), "NDJSON must terminate the final event");
  return text.trim().split("\n").map((line) => JSON.parse(line) as StreamEvent);
}

test("classification preserves author metadata and the five independent question contracts", async (context) => {
  environment(context, { JEV_MODEL: "test-model" });
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-typesafe-key");
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(payload.state, { comment: "好きだけど音が大きい" });
    assert.equal(payload.model, "test-model");
    assert.equal(payload.questions.valence.type, "score");
    assert.equal(payload.questions.heat.type, "score");
    assert.equal(payload.questions.valence.criteria.length, 5);
    assert.equal(payload.questions.heat.criteria.length, 5);
    assert.equal(payload.questions.both_sides.type, "noul");
    assert.equal(payload.questions.gender.type, "choice");
    assert.equal(payload.questions.age.type, "choice");
    const metadata = getAnalyzerMetadata();
    assert.equal(metadata.model, payload.model, "saved model must match the actual classifier request");
    assert.equal(metadata.definitionHash, createHash("sha256").update(JSON.stringify({ questions: payload.questions, valenceStages, heatStages })).digest("hex"), "definition hash must describe the questions actually sent and their numeric score anchors");
    return Response.json(classification(3));
  });
  const raw = {
    id: "comment-one", text: "好きだけど音が大きい", publishedAt: "2026-09-25T00:00:00Z", likeCount: 4,
    authorChannelId: "author-one", authorDisplayName: "実際の投稿者", authorProfileImageUrl: "https://example.test/avatar.jpg",
  };
  const result = await classifyComment(raw);
  for (const key of Object.keys(raw) as (keyof typeof raw)[]) assert.equal(result.item[key], raw[key]);
  assert.deepEqual(result.item.valenceProbabilities, { 0: 0.04, 1: 0.08, 2: 0.38, 3: 0.24, 4: 0.26 });
  assert.deepEqual(result.item.heatProbabilities, { 0: 0.2, 1: 0.41, 2: 0.3, 3: 0.07, 4: 0.02 });
  assert.equal(result.item.gender, "feminine_coded");
  assert.equal(result.item.age, "working_adult");
  assert.equal(result.item.bothSidesProbability, 0.67);
  assert.deepEqual(result.usage, { inputTokens: 30, outputTokens: 3 });
});

test("stream reports successes and failures, limits concurrency to four, and completes with accumulated usage", { timeout: 5000 }, async (context) => {
  environment(context, { JEV_MODEL: "archive-test-model", GIT_COMMIT: "a".repeat(40), VERCEL_GIT_COMMIT_SHA: undefined });
  let releaseInitial!: () => void;
  const initialGate = new Promise<void>((resolve) => { releaseInitial = resolve; });
  let signalFour!: () => void;
  const fourStarted = new Promise<void>((resolve) => { signalFour = resolve; });
  let active = 0;
  let maximumActive = 0;
  let classifyCalls = 0;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "www.googleapis.com") {
      assert.equal(url.pathname, "/youtube/v3/commentThreads");
      return Response.json({ items: Array.from({ length: 8 }, (_, index) => youtubeThread(index + 1)), pageInfo: { totalResults: 8 } });
    }
    assert.equal(url.href, "https://api.typesafe.ai/v1/systemone");
    const index = Number(JSON.parse(String(init?.body)).state.comment.split(" ")[1]);
    classifyCalls++;
    active++;
    maximumActive = Math.max(maximumActive, active);
    if (active === 4) signalFour();
    if (classifyCalls <= 4) await initialGate;
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
    return index === 3 || index === 7
      ? Response.json({ error: { message: `分類失敗 ${index}` } }, { status: 503 })
      : Response.json(classification(index));
  });

  const requestedAt = Date.now();
  const response = await POST(request("first100"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type")!, /^application\/x-ndjson/);
  assert.equal(response.headers.get("X-Accel-Buffering"), "no");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const first = await reader.read();
  let text = decoder.decode(first.value, { stream: true });
  assert.equal(JSON.parse(text.trim()).type, "status", "fetch status is delivered before classification finishes");
  await fourStarted;
  assert.equal(classifyCalls, 4);
  assert.equal(active, 4);
  releaseInitial();
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }
  text += decoder.decode();
  const events = eventsFromText(text);
  assert.equal(maximumActive, 4);
  assert.equal(classifyCalls, 8);
  assert.equal(events[0].phase, "fetching");
  const provenance = events[0];
  assert.ok(Date.parse(provenance.startedAt!) >= requestedAt);
  assert.equal(provenance.completedAt, undefined);
  assert.deepEqual(provenance.analyzer, getAnalyzerMetadata());
  assert.equal(provenance.analyzer!.model, "archive-test-model");
  assert.equal(provenance.analyzer!.gitCommit, "a".repeat(40));
  assert.match(provenance.analyzer!.definitionHash!, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(provenance).includes("test-typesafe-key"));
  assert.deepEqual({ ...events[1], elapsedMs: undefined }, { type: "start", total: 8, sourceTotal: 8, elapsedMs: undefined });
  const processed = events.filter((event) => event.type === "item" || event.type === "item_error");
  assert.deepEqual(processed.map((event) => event.processed), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(processed.every((event) => event.total === 8));
  assert.deepEqual(events.filter((event) => event.type === "item_error").map((event) => event.id).sort(), ["comment-3", "comment-7"]);
  const succeeded = events.filter((event) => event.type === "item");
  assert.equal(succeeded.length, 6);
  assert.ok(succeeded.every((event) => event.item!.authorDisplayName?.startsWith("投稿者 ")));
  assert.ok(succeeded.every((event) => event.item!.authorProfileImageUrl?.startsWith("https://example.test/avatar-")));
  const complete = events.at(-1)!;
  assert.equal(complete.type, "complete");
  assert.equal(complete.processed, 8);
  assert.equal(complete.total, 8);
  assert.equal(complete.failures, 2);
  assert.deepEqual(complete.usage, { inputTokens: 260, outputTokens: 26, estimatedCostUsd: 260 * 0.042 / 1_000_000 });
  assert.deepEqual(processed.at(-1)!.usage, complete.usage);
  assert.ok(complete.elapsedMs! >= 0 && complete.classifyElapsedMs! >= 0);
  assert.ok(Date.parse(complete.completedAt!) >= Date.parse(provenance.startedAt!));
  assert.ok(Date.parse(complete.completedAt!) <= Date.now());

  // Reproduce the UI's completed snapshot using actual streamed data. Mixed
  // success/failure results must remain saveable with their original provenance.
  const snapshot = {
    video: { id: "example1234", title: "API regression fixture", channel: "test", count: 8 },
    items: succeeded.map((event) => event.item!),
    analysis: {
      startedAt: provenance.startedAt, completedAt: complete.completedAt,
      source: "jev", status: "complete", scope: "first100", order: "relevance", includeReplies: false,
      processed: complete.processed, total: complete.total, failures: complete.failures,
      elapsedSeconds: complete.elapsedMs! / 1000, usage: complete.usage, analyzer: provenance.analyzer,
    },
  };
  const saved = parseAnalysisSaveInput(snapshot);
  assert.equal(saved.items.length, 6);
  assert.equal(saved.analysis.processed, 8);
  assert.equal(saved.analysis.failures, 2);
  assert.deepEqual(saved.analysis.analyzer, provenance.analyzer);
  assert.ok(saved.items.every((item) => item.authorProfileImageUrl === undefined));

  // A disconnected client can save the success items it received before EOF.
  const partialEvents = processed.slice(0, 4);
  const partial = parseAnalysisSaveInput({
    ...snapshot, items: partialEvents.filter((event) => event.type === "item").map((event) => event.item!),
    analysis: {
      ...snapshot.analysis, completedAt: null, status: "partial", processed: 4,
      failures: partialEvents.filter((event) => event.type === "item_error").length,
      usage: partialEvents.at(-1)!.usage,
    },
  });
  assert.equal(partial.analysis.processed, partial.items.length + partial.analysis.failures);
  assert.equal(partial.analysis.total, 8);
  assert.equal(partial.analysis.completedAt, null);
});

test("analyzer provenance records app version and optional deployment revision without credentials", (context) => {
  environment(context, { JEV_MODEL: undefined, GIT_COMMIT: undefined, VERCEL_GIT_COMMIT_SHA: "c".repeat(40) });
  const metadata = getAnalyzerMetadata();
  assert.equal(metadata.provider, "typesafe.ai");
  assert.equal(metadata.model, "jev-latest");
  assert.equal(metadata.definitionVersion, 1);
  assert.equal(metadata.appVersion, packageInfo.version);
  assert.equal(metadata.gitCommit, "c".repeat(40));
  assert.equal(metadata.definitionHash, getAnalyzerMetadata().definitionHash);
  assert.ok(!JSON.stringify(metadata).includes("test-typesafe-key"));
  process.env.GIT_COMMIT = "not-a-revision";
  assert.equal(getAnalyzerMetadata().gitCommit, null);
});

for (const scope of ["first100", "all"] as const) {
  test(`scope ${scope} fetches and classifies the intended range`, async (context) => {
    environment(context);
    const youtubePages: (string | null)[] = [];
    let classifications = 0;
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "www.googleapis.com") {
        const token = url.searchParams.get("pageToken");
        youtubePages.push(token);
        return Response.json(token
          ? { items: [youtubeThread(101)], pageInfo: { totalResults: 101 } }
          : { items: Array.from({ length: 100 }, (_, index) => youtubeThread(index + 1)), pageInfo: { totalResults: 101 }, nextPageToken: "second-page" });
      }
      assert.equal(url.href, "https://api.typesafe.ai/v1/systemone");
      classifications++;
      return Response.json(classification(1));
    });
    const response = await POST(request(scope));
    const events = eventsFromText(await response.text());
    const expected = scope === "first100" ? 100 : 101;
    assert.deepEqual(youtubePages, scope === "first100" ? [null] : [null, "second-page"]);
    assert.equal(classifications, expected);
    assert.equal(events.find((event) => event.type === "start")!.total, expected);
    assert.equal(events.find((event) => event.type === "start")!.sourceTotal, 101);
    assert.equal(events.filter((event) => event.type === "item").length, expected);
    assert.equal(events.at(-1)!.processed, expected);
    assert.equal(events.at(-1)!.failures, 0);
    assert.equal(events.at(-1)!.usage!.inputTokens, expected * 10);
  });
}

test("more than 100 comments requires an explicit scope before any classifier call", async (context) => {
  environment(context);
  const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(new URL(String(input)).hostname, "www.googleapis.com");
    return Response.json({ items: [youtubeThread(1)], pageInfo: { totalResults: 101 } });
  });
  const events = eventsFromText(await (await POST(request())).text());
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.deepEqual(events.map((event) => event.type), ["status", "error"]);
  assert.match(events.at(-1)!.message!, /分析範囲の選択が必要/);
});

test("missing classifier key returns 503 before fetching, while missing YouTube key closes the stream with an error", async (context) => {
  environment(context, { TYPESAFE_API_KEY: undefined, YOUTUBE_DATA_API_KEY: undefined });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network call"); });
  const unavailable = await POST(request("first100"));
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /TYPESAFE_API_KEY/);
  await assert.rejects(classifyComment({ id: "1", text: "本文", publishedAt: "", likeCount: 0 }), /TYPESAFE_API_KEY/);
  process.env.TYPESAFE_API_KEY = "test-typesafe-key";
  const events = eventsFromText(await (await POST(request("first100"))).text());
  assert.deepEqual(events.map((event) => event.type), ["status", "error"]);
  assert.match(events.at(-1)!.message!, /YOUTUBE_DATA_API_KEY/);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("an empty public comment set ends in a stream error without classification", async (context) => {
  environment(context);
  const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(new URL(String(input)).hostname, "www.googleapis.com");
    return Response.json({ items: [], pageInfo: { totalResults: 0 } });
  });
  const events = eventsFromText(await (await POST(request("all"))).text());
  assert.deepEqual(events.map((event) => event.type), ["status", "error"]);
  assert.match(events.at(-1)!.message!, /公開コメントがありません/);
  assert.equal(fetchMock.mock.calls.length, 1);
});
