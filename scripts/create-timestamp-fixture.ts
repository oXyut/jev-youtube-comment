import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { toneOf, type Item, type Tone, type Video } from "../lib/analysis";
import { createAnalysisArchive, parseAnalysisArchive, type AnalysisMetadata } from "../lib/analysis-archive";
import { sampleItems } from "../lib/sample-data";
import { buildTimestampIndex, summarizeRange } from "../lib/timestamp-aggregation";

// All comment text and identities below are synthetic. Only existing sample
// probabilities are reused; this script never fetches or analyzes comments.
const definitions: { tone: Tone | "unknown"; text: string }[] = [
  { tone: "positive", text: "合成コメント01： 0:00 の開始を確認。０：００ は同じ秒の繰り返しです。" },
  { tone: "critical", text: "合成コメント02： 0:30 と 0:45 は同じ60秒区間内です。" },
  { tone: "center", text: "合成コメント03： 1:00 と 1:59 は区間境界確認用です。" },
  { tone: "unknown", text: "合成コメント04： 2:05 の感情は未取得です。この区間は未取得のみです。" },
  { tone: "positive", text: "合成コメント05： 3:24〜3:40 は2つの明示点です。間の全時刻には配りません。" },
  { tone: "center", text: "合成コメント06： 29:17 は任意範囲の開始直前です。" },
  { tone: "positive", text: "合成コメント07： 29:18 は任意範囲に含まれる開始時刻です。" },
  { tone: "critical", text: "合成コメント08： 29:30、29:40、29:59 は同じ区間に3回言及しています。" },
  { tone: "center", text: "合成コメント09： 29:59 と 30:00 を比較します。2つの区間でも範囲全体では1件です。" },
  { tone: "unknown", text: "合成コメント10： 30:01 と 30:10 の感情は未取得です。分母には含まれます。" },
  { tone: "positive", text: "合成コメント11： 30:11 は任意範囲の終了直前です。" },
  { tone: "critical", text: "合成コメント12： 30:12 は任意範囲の終了時刻なので含まれません。" },
  { tone: "positive", text: "合成コメント13： 29:20 と 30:05 に言及しています。区間の単純加算との違いを確認します。" },
  { tone: "center", text: "合成コメント14： 29:18、29:18、２９：１８ は同じ秒です。すべての原文リンクを残し、件数は1件です。" },
  { tone: "positive", text: "合成コメント15： 29:45 の確認です。\n全文ダイアログで改行と長い本文を確認します。<strong>これはHTMLではなく原文です。</strong>\n表示を省略した一覧からも同じ既存ダイアログを開けます。範囲外の 0:30 を押しても分析範囲と一覧は変わりません。" },
  { tone: "critical", text: "合成コメント16： 49:23 は動画内の最後の秒です。49:24 は動画尺と同じなので除外されます。" },
  { tone: "positive", text: "合成コメント17： 49:24 と 90:00 は動画尺以上の候補だけです。尺ありでは時間帯別の対象外になります。" },
  { tone: "center", text: "合成コメント18：URL https://example.com/3:24 と明示時計 午後 12:30 は除外します。" },
  { tone: "positive", text: "合成コメント19：時刻なしの本文です。検索して時間表記のない空状態を確認できます。" },
  { tone: "critical", text: "合成コメント20： 5:00 は離れた単独観測点です。好意寄りと中央帯は実際の0%です。" },
];

const zeroDistribution = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
function syntheticItem(definition: (typeof definitions)[number], index: number): Item {
  const tone = definition.tone === "unknown" ? "center" : definition.tone;
  const candidates = sampleItems.filter((item) => toneOf(item) === tone);
  const sample = candidates[index % candidates.length];
  return {
    ...sample,
    id: `timestamp-fixture-${String(index + 1).padStart(2, "0")}`,
    text: definition.text,
    authorDisplayName: `合成投稿者 ${String(index + 1).padStart(2, "0")}`,
    publishedAt: new Date(Date.UTC(2026, 8, 26, 0, index)).toISOString(),
    likeCount: (index * 7 + 3) % 41,
    ...(definition.tone === "unknown" ? { valenceProbabilities: { ...zeroDistribution }, valenceConfidence: null } : {}),
  };
}

function metadata(total: number): AnalysisMetadata {
  return {
    startedAt: "2026-09-26T00:00:00.000Z", completedAt: "2026-09-26T00:00:00.000Z",
    source: "sample", status: "complete", scope: "first100", order: "relevance", includeReplies: false,
    processed: total, total, failures: 0, elapsedSeconds: 0,
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    analyzer: {
      provider: "typesafe.ai", model: "synthetic-fixture-no-api", definitionVersion: 1,
      definitionHash: null, appVersion: "0.1.0", gitCommit: null,
    },
  };
}

async function main() {
  const directory = fileURLToPath(new URL("../reports/timestamp-analysis-implementation/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const items = definitions.map(syntheticItem);
  const video: Video = {
    id: "zuQb52Up9VQ", title: "時間帯別の合成検証データ（コメントは架空）", channel: "合成検証用", count: items.length, durationSeconds: 2964,
  };
  const legacyVideo: Video = { id: video.id, title: `${video.title}・尺なしv1`, channel: video.channel, count: video.count };
  const unknownItems = [
    "合成未取得01： 0:00 の感情未取得です。",
    "合成未取得02： 29:18 と 30:01 の感情未取得です。",
    "合成未取得03： 49:23 の感情未取得です。",
  ].map((text, index) => syntheticItem({ tone: "unknown", text }, index));
  const extremeItems = [
    syntheticItem({ tone: "positive", text: "合成極端01： 29:18 は通常の時間表記です。" }, 0),
    syntheticItem({ tone: "critical", text: "合成極端02： 9999:59:59 は未確認の極端な時間表記です。" }, 1),
  ];
  const variants = [
    { filename: "fixture.json", video, items, suffix: "1" },
    { filename: "legacy-fixture.json", video: legacyVideo, items, suffix: "2" },
    { filename: "unknown-fixture.json", video: { ...video, title: "感情未取得のみの合成検証データ", count: unknownItems.length }, items: unknownItems, suffix: "3" },
    { filename: "extreme-legacy-fixture.json", video: { ...legacyVideo, title: "極端な時刻・尺なしの合成検証データ", count: extremeItems.length }, items: extremeItems, suffix: "4" },
  ];
  for (const variant of variants) {
    const archive = createAnalysisArchive({ video: variant.video, items: variant.items, analysis: metadata(variant.items.length) }, {
      id: `20260926-0000-4000-8000-00000000000${variant.suffix}`, savedAt: "2026-09-26T00:30:00.000Z",
    });
    // Validate the serialized representation using the same parser as JSON import.
    parseAnalysisArchive(JSON.parse(JSON.stringify(archive)));
    await writeFile(`${directory}${variant.filename}`, `${JSON.stringify(archive, null, 2)}\n`);
    console.log(`${variant.filename}: ${archive.items.length} synthetic comments`);
  }
  const index = buildTimestampIndex(items, video.durationSeconds);
  const summary = summarizeRange(index.entries, { startSeconds: 1758, endSeconds: 1812 });
  console.log(JSON.stringify({ validComments: index.entries.length, excludedCandidates: index.excludedCount, range: "29:18–30:12", total: summary.total, counts: summary.counts, percentages: summary.percentages }, null, 2));
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
