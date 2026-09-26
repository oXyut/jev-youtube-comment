/** Offsets are UTF-16 offsets in the original comment, suitable for String.slice. */
export type TimestampMention = { seconds: number; start: number; end: number; text: string };

/** Normalize only the captured token; never use normalized-text offsets on the original. */
function normalizeToken(text: string): string {
  return text.replace(/[０-９：]/g, (character) => character === "："
    ? ":" : String.fromCharCode(character.charCodeAt(0) - 0xfee0));
}

function parseColonTimestamp(token: string): number | null {
  const parts = normalizeToken(token).split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (!/^\d{1,2}$/.test(parts.at(-1)!) || parts.at(-1)!.length !== 2 || Number(parts.at(-1)) > 59) return null;
  if (parts.length === 2 && !/^\d{1,2}$/.test(parts[0])) return null;
  if (parts.length === 3 && (!/^\d+$/.test(parts[0]) || !/^\d{2}$/.test(parts[1]) || Number(parts[1]) > 59)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
}

function explicitlyClockTime(text: string, start: number, end: number): boolean {
  const before = normalizeToken(text.slice(Math.max(0, start - 80), start));
  const after = normalizeToken(text.slice(end, end + 20));
  // Deliberately small, explicit rules: an ambiguous bare 12:30 remains a mention.
  return /(?:午前|午後|AM|PM|A\.M\.|P\.M\.|時刻|時計|現在時刻|現在|time)\s*[:：=]?\s*$/i.test(before)
    || /(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日|\d{4}年\d{1,2}月\d{1,2}日)[T\s]*$/.test(before)
    || /^\s*(?:[AP]M\b|[AP]\.M\.|JST\b|UTC\b|GMT\b)/i.test(after);
}

/** Valid text timestamps before duration validation; URLs and explicit clock/date times are omitted. */
export function extractTimestampCandidates(text: string): TimestampMention[] {
  const urlSpans = [...text.matchAll(/(?:[a-z][a-z\d+.-]*[:：]\/\/|www\.|(?:[a-z\d-]+\.)+[a-z]{2,}\/)[^\s<>"'（）()、。！？]+/gi)]
    .map((match) => ({ start: match.index!, end: match.index! + match[0].length }));
  const mentions: TimestampMention[] = [];
  // Consume the entire digit/colon run, including malformed runs, so a valid suffix
  // of 1:99:24 or 12345:24 can never be mistaken for an independent timestamp.
  for (const match of text.matchAll(/[0-9０-９:：]*[0-9０-９][0-9０-９:：]*/g)) {
    if (!/[:：]/.test(match[0])) continue;
    const start = match.index!;
    const end = start + match[0].length;
    const seconds = parseColonTimestamp(match[0]);
    if (seconds === null || urlSpans.some((span) => start < span.end && end > span.start)
      || explicitlyClockTime(text, start, end)) continue;
    mentions.push({ seconds, start, end, text: match[0] });
  }
  return mentions;
}

/** All original occurrences are retained for links; aggregation deduplicates by second. */
export function extractTimestamps(text: string, durationSeconds?: number | null): TimestampMention[] {
  const mentions = extractTimestampCandidates(text);
  return typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? mentions.filter((mention) => mention.seconds < durationSeconds) : mentions;
}

/** Range fields accept a timestamp or a nonnegative integer number of seconds. */
export function parseTimestampInput(text: string): number | null {
  const value = normalizeToken(text.trim());
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  return parseColonTimestamp(value);
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  const remainder = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}
