import { toneForScore, valenceOf, type Item, type Tone } from "./analysis";
import { valenceStages } from "./scales";
import { extractTimestampCandidates, type TimestampMention } from "./timestamps";

export type TimeRange = { startSeconds: number; endSeconds: number };
export type TimestampEntry = { item: Item; mentions: TimestampMention[] };
export type TimestampTone = Tone | "unknown";
export type Summary = {
  items: Item[];
  total: number;
  counts: Record<TimestampTone, number>;
  /** Shares use 0–100. A missing observation is null, distinct from a genuine 0%. */
  percentages: Record<TimestampTone, number | null>;
};
export type TimestampBin = Summary & TimeRange & { midpointSeconds: number };
export const MAX_TIMESTAMP_BINS = 5000;

/** One entry per ID and one mention per second. The first item for an ID supplies its analysis. */
export function buildTimestampIndex(items: readonly Item[], durationSeconds?: number | null): {
  entries: TimestampEntry[]; excludedCount: number;
} {
  const byId = new Map<string, { item: Item; mentions: Map<number, TimestampMention> }>();
  const excluded = new Set<string>();
  const knownDuration = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0;
  for (const item of items) {
    let entry = byId.get(item.id);
    if (!entry) { entry = { item, mentions: new Map() }; byId.set(item.id, entry); }
    for (const mention of extractTimestampCandidates(item.text)) {
      if (knownDuration && mention.seconds >= durationSeconds) {
        excluded.add(`${item.id}\u0000${mention.seconds}`);
      } else if (!entry.mentions.has(mention.seconds)) entry.mentions.set(mention.seconds, mention);
    }
  }
  return {
    entries: [...byId.values()].filter((entry) => entry.mentions.size > 0)
      .map(({ item, mentions }) => ({ item, mentions: [...mentions.values()].sort((a, b) => a.seconds - b.seconds) })),
    excludedCount: excluded.size,
  };
}

export function timestampToneOf(item: Item): TimestampTone {
  const probabilities = valenceStages.map((stage) => item.valenceProbabilities[String(stage.level)] ?? 0);
  if (probabilities.some((value) => !Number.isFinite(value) || value < 0)
    || !probabilities.some((value) => value > 0)) return "unknown";
  return toneForScore(valenceOf(item));
}

type MatchedItem = { item: Item; firstSeconds: number };
function summarizeMatches(matches: Iterable<MatchedItem>): Summary {
  const sorted = [...matches].sort((a, b) => a.firstSeconds - b.firstSeconds
    || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
  const items = sorted.map(({ item }) => item);
  const total = items.length;
  const counts: Summary["counts"] = { critical: 0, center: 0, positive: 0, unknown: 0 };
  for (const item of items) counts[timestampToneOf(item)]++;
  const hasSentiment = total > counts.unknown;
  return {
    items, total, counts,
    percentages: {
      critical: hasSentiment ? counts.critical / total * 100 : null,
      center: hasSentiment ? counts.center / total * 100 : null,
      positive: hasSentiment ? counts.positive / total * 100 : null,
      unknown: total ? counts.unknown / total * 100 : null,
    },
  };
}

function validRange(range: TimeRange): boolean {
  return Number.isFinite(range.startSeconds) && Number.isFinite(range.endSeconds)
    && range.startSeconds >= 0 && range.endSeconds > range.startSeconds;
}

/** Select the original mentions with start <= t < end, never by summing bins. */
export function summarizeRange(entries: readonly TimestampEntry[], range: TimeRange | null): Summary {
  const matches = new Map<string, MatchedItem>();
  if (range && !validRange(range)) return summarizeMatches([]);
  for (const { item, mentions } of entries) {
    for (const mention of mentions) {
      if (range && (mention.seconds < range.startSeconds || mention.seconds >= range.endSeconds)) continue;
      const existing = matches.get(item.id);
      if (!existing || mention.seconds < existing.firstSeconds) matches.set(item.id, { item: existing?.item ?? item, firstSeconds: mention.seconds });
    }
  }
  return summarizeMatches(matches.values());
}

/**
 * Bins always start at video second zero. Empty bins are kept as missing observations.
 * Return [] for invalid / excessive extents; callers can show the timestamp list
 * with a length-unconfirmed notice instead of allocating an unbounded chart.
 */
export function aggregateBins(entries: readonly TimestampEntry[], binSeconds: number, endSeconds: number): TimestampBin[] {
  if (!Number.isFinite(binSeconds) || binSeconds <= 0 || !Number.isFinite(endSeconds) || endSeconds <= 0) return [];
  const count = Math.ceil(endSeconds / binSeconds);
  if (count > MAX_TIMESTAMP_BINS) return [];
  const matches = Array.from({ length: count }, () => new Map<string, MatchedItem>());
  for (const { item, mentions } of entries) {
    for (const mention of mentions) {
      if (!Number.isFinite(mention.seconds) || mention.seconds < 0 || mention.seconds >= endSeconds) continue;
      const bin = matches[Math.floor(mention.seconds / binSeconds)];
      const existing = bin.get(item.id);
      if (!existing || mention.seconds < existing.firstSeconds) bin.set(item.id, { item: existing?.item ?? item, firstSeconds: mention.seconds });
    }
  }
  return matches.map((bin, index) => {
    const startSeconds = index * binSeconds;
    const binEnd = Math.min(startSeconds + binSeconds, endSeconds);
    return { ...summarizeMatches(bin.values()), startSeconds, endSeconds: binEnd, midpointSeconds: (startSeconds + binEnd) / 2 };
  });
}

/** Each returned run may be connected with straight lines; one-bin runs need a visible point. */
export function timestampLineSegments(bins: readonly TimestampBin[], tone: Tone): TimestampBin[][] {
  const segments: TimestampBin[][] = [];
  let current: TimestampBin[] = [];
  for (const bin of bins) {
    if (bin.percentages[tone] === null) { current = []; continue; }
    if (!current.length) segments.push(current);
    current.push(bin);
  }
  return segments;
}
