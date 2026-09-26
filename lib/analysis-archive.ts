import { ages, genders, type Item, type Video } from "./analysis";

export const ANALYSIS_ARCHIVE_FORMAT = "jev-youtube-comment-analysis" as const;
export const ANALYSIS_ARCHIVE_SCHEMA_VERSION = 1 as const;

export type AnalysisMetadata = {
  startedAt: string | null;
  completedAt: string | null;
  source: "jev" | "sample";
  status: "complete" | "partial";
  scope: "first100" | "all";
  order: "relevance";
  includeReplies: false;
  processed: number;
  total: number;
  failures: number;
  elapsedSeconds: number;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  analyzer: {
    provider: "typesafe.ai";
    model: string;
    definitionVersion: 1;
    definitionHash: string | null;
    appVersion: string;
    gitCommit: string | null;
  };
};

export type AnalysisSaveInput = { video: Video; items: Item[]; analysis: AnalysisMetadata };
export type AnalysisArchive = AnalysisSaveInput & {
  format: typeof ANALYSIS_ARCHIVE_FORMAT;
  schemaVersion: typeof ANALYSIS_ARCHIVE_SCHEMA_VERSION;
  id: string;
  savedAt: string;
};
export type AnalysisArchiveSummary = { id: string; savedAt: string; video: Video; itemCount: number; analysis: AnalysisMetadata };

export class ArchiveValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ArchiveValidationError"; }
}

function invalid(field: string, reason: string): never {
  throw new ArchiveValidationError(`${field}: ${reason}`);
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field, "オブジェクトが必要です。");
  return value as Record<string, unknown>;
}
function string(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) invalid(field, "文字列が必要です。");
  return value;
}
function number(value: unknown, field: string, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    invalid(field, integer ? "0以上の安全な整数が必要です。" : "0以上の有限数が必要です。");
  }
  return value;
}
function probability(value: unknown, field: string): number {
  const result = number(value, field);
  if (result > 1) invalid(field, "確率は0〜1で指定してください。");
  return result;
}
function nullableProbability(value: unknown, field: string): number | null {
  return value === null ? null : probability(value, field);
}
function member<const T extends readonly string[]>(value: unknown, options: T, field: string): T[number] {
  if (typeof value !== "string" || !options.includes(value)) invalid(field, "未対応の区分です。");
  return value;
}
function timestamp(value: unknown, field: string): string {
  const result = string(value, field);
  // Normalize neither dates nor timezones: preserve the original, valid ISO instant.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result) || !Number.isFinite(Date.parse(result))) {
    invalid(field, "UTCのISO日時が必要です。");
  }
  const normalized = new Date(result).toISOString();
  if (normalized.slice(0, 19) !== result.slice(0, 19)) invalid(field, "実在する日時を指定してください。");
  return result;
}
function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : timestamp(value, field);
}
function hash(value: unknown, field: string, pattern: RegExp): string | null {
  if (value === null) return null;
  const result = string(value, field);
  if (!pattern.test(result)) invalid(field, "ハッシュの形式が正しくありません。");
  return result;
}
function distribution(value: unknown, options: readonly string[], field: string): Record<string, number> {
  const raw = object(value, field);
  if (Object.keys(raw).length !== options.length || Object.keys(raw).some((key) => !options.includes(key))) {
    invalid(field, "確率分布の区分が仕様と一致しません。");
  }
  const result = Object.fromEntries(options.map((key) => [key, probability(raw[key], `${field}.${key}`)]));
  const total = Object.values(result).reduce((sum, entry) => sum + entry, 0);
  if (total !== 0 && Math.abs(total - 1) > 1e-6) invalid(field, "確率の合計は1（取得不可の場合はすべて0）である必要があります。");
  return result;
}

export function isAnalysisArchiveId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseVideo(value: unknown): Video {
  const raw = object(value, "video");
  const durationSeconds = raw.durationSeconds === undefined ? undefined : number(raw.durationSeconds, "video.durationSeconds");
  if (durationSeconds === 0) invalid("video.durationSeconds", "正の有限数が必要です。尺が不明な場合は省略してください。");
  return {
    id: string(raw.id, "video.id"), title: string(raw.title, "video.title"),
    channel: string(raw.channel, "video.channel"), count: number(raw.count, "video.count", true),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  };
}
function parseItem(value: unknown, index: number): Item {
  const field = `items[${index}]`;
  const raw = object(value, field);
  const gender = member(raw.gender, genders, `${field}.gender`);
  const age = member(raw.age, ages, `${field}.age`);
  const genderProbability = probability(raw.genderProbability, `${field}.genderProbability`);
  const ageProbability = probability(raw.ageProbability, `${field}.ageProbability`);
  const genderProbabilities = distribution(raw.genderProbabilities, genders, `${field}.genderProbabilities`);
  const ageProbabilities = distribution(raw.ageProbabilities, ages, `${field}.ageProbabilities`);
  if (Math.abs(genderProbability - genderProbabilities[gender]) > 1e-6 || Math.abs(ageProbability - ageProbabilities[age]) > 1e-6) {
    invalid(field, "選択区分の確率と確率分布が一致しません。");
  }
  // Explicitly copy fields: images and unknown fields (including credentials) never persist.
  return {
    id: string(raw.id, `${field}.id`), text: string(raw.text, `${field}.text`, true),
    publishedAt: timestamp(raw.publishedAt, `${field}.publishedAt`), likeCount: number(raw.likeCount, `${field}.likeCount`, true),
    ...(raw.authorChannelId !== undefined ? { authorChannelId: string(raw.authorChannelId, `${field}.authorChannelId`, true) } : {}),
    ...(raw.authorDisplayName !== undefined ? { authorDisplayName: string(raw.authorDisplayName, `${field}.authorDisplayName`, true) } : {}),
    gender, age, genderProbability, ageProbability, genderProbabilities, ageProbabilities,
    valenceProbabilities: distribution(raw.valenceProbabilities, ["0", "1", "2", "3", "4"], `${field}.valenceProbabilities`),
    heatProbabilities: distribution(raw.heatProbabilities, ["0", "1", "2", "3", "4"], `${field}.heatProbabilities`),
    valenceConfidence: nullableProbability(raw.valenceConfidence, `${field}.valenceConfidence`),
    heatConfidence: nullableProbability(raw.heatConfidence, `${field}.heatConfidence`),
    bothSidesProbability: nullableProbability(raw.bothSidesProbability, `${field}.bothSidesProbability`),
  };
}
function parseMetadata(value: unknown, itemCount: number): AnalysisMetadata {
  const raw = object(value, "analysis");
  const usage = object(raw.usage, "analysis.usage");
  const analyzer = object(raw.analyzer, "analysis.analyzer");
  const startedAt = nullableTimestamp(raw.startedAt, "analysis.startedAt");
  const completedAt = nullableTimestamp(raw.completedAt, "analysis.completedAt");
  if (startedAt && completedAt && Date.parse(completedAt) < Date.parse(startedAt)) invalid("analysis.completedAt", "開始日時より前にはできません。");
  const status = member(raw.status, ["complete", "partial"], "analysis.status");
  const processed = number(raw.processed, "analysis.processed", true);
  const total = number(raw.total, "analysis.total", true);
  const failures = number(raw.failures, "analysis.failures", true);
  if (processed !== itemCount + failures) invalid("analysis.processed", "保存コメント件数と失敗件数の合計に一致する必要があります。");
  if (processed > total || (status === "complete" && processed !== total)) invalid("analysis.total", "処理件数・完了状態と一致しません。");
  if (raw.includeReplies !== false) invalid("analysis.includeReplies", "返信を含む保存形式には対応していません。");
  if (analyzer.definitionVersion !== 1) invalid("analysis.analyzer.definitionVersion", "未対応の分類定義バージョンです。");
  return {
    startedAt, completedAt, source: member(raw.source, ["jev", "sample"], "analysis.source"), status,
    scope: member(raw.scope, ["first100", "all"], "analysis.scope"), order: member(raw.order, ["relevance"], "analysis.order"), includeReplies: false,
    processed, total, failures, elapsedSeconds: number(raw.elapsedSeconds, "analysis.elapsedSeconds"),
    usage: {
      inputTokens: number(usage.inputTokens, "analysis.usage.inputTokens", true),
      outputTokens: number(usage.outputTokens, "analysis.usage.outputTokens", true),
      estimatedCostUsd: number(usage.estimatedCostUsd, "analysis.usage.estimatedCostUsd"),
    },
    analyzer: {
      provider: member(analyzer.provider, ["typesafe.ai"], "analysis.analyzer.provider"),
      model: string(analyzer.model, "analysis.analyzer.model"), definitionVersion: 1,
      definitionHash: hash(analyzer.definitionHash, "analysis.analyzer.definitionHash", /^[0-9a-f]{64}$/i),
      appVersion: string(analyzer.appVersion, "analysis.analyzer.appVersion"),
      gitCommit: hash(analyzer.gitCommit, "analysis.analyzer.gitCommit", /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i),
    },
  };
}

/** Browser-safe validator shared by server storage and JSON import/export. */
export function parseAnalysisSaveInput(value: unknown): AnalysisSaveInput {
  const raw = object(value, "保存データ");
  if (!Array.isArray(raw.items) || !raw.items.length) invalid("items", "判定済みコメントが1件以上必要です。");
  const items = raw.items.map(parseItem);
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid("items", "コメントIDが重複しています。");
  return { video: parseVideo(raw.video), items, analysis: parseMetadata(raw.analysis, items.length) };
}

export function createAnalysisArchive(input: unknown, identity: { id: string; savedAt: string }): AnalysisArchive {
  if (!isAnalysisArchiveId(identity.id)) invalid("id", "保存IDはUUIDで指定してください。");
  return {
    format: ANALYSIS_ARCHIVE_FORMAT, schemaVersion: ANALYSIS_ARCHIVE_SCHEMA_VERSION,
    id: identity.id.toLowerCase(), savedAt: timestamp(identity.savedAt, "savedAt"), ...parseAnalysisSaveInput(input),
  };
}

export function parseAnalysisArchive(value: unknown): AnalysisArchive {
  const raw = object(value, "保存データ");
  if (raw.format !== ANALYSIS_ARCHIVE_FORMAT) invalid("format", "このアプリの分析保存ファイルではありません。");
  if (raw.schemaVersion !== ANALYSIS_ARCHIVE_SCHEMA_VERSION) invalid("schemaVersion", "未対応の保存形式バージョンです。");
  return createAnalysisArchive(raw, { id: string(raw.id, "id"), savedAt: string(raw.savedAt, "savedAt") });
}

export function analysisArchiveSummary(archive: AnalysisArchive): AnalysisArchiveSummary {
  return { id: archive.id, savedAt: archive.savedAt, video: archive.video, itemCount: archive.items.length, analysis: archive.analysis };
}
