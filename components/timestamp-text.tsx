import React, { Fragment, type ReactNode } from "react";
import { extractTimestamps } from "@/lib/timestamps";

type TimestampTextProps = {
  text: string;
  onTimestampSelect?: (seconds: number) => void;
  timestampRange?: { startSeconds: number; endSeconds: number } | null;
  durationSeconds?: number | null;
  className?: string;
  selectedClassName?: string;
};

/** Render original text, including repeated mentions, without HTML interpolation. */
export function TimestampText({ text, onTimestampSelect, timestampRange, durationSeconds, className, selectedClassName }: TimestampTextProps) {
  if (!onTimestampSelect) return <>{text}</>;
  const mentions = extractTimestamps(text, durationSeconds);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const mention of mentions) {
    if (cursor < mention.start) parts.push(text.slice(cursor, mention.start));
    const inRange = Boolean(timestampRange && timestampRange.startSeconds <= mention.seconds && mention.seconds < timestampRange.endSeconds);
    const original = text.slice(mention.start, mention.end);
    parts.push(<button
      type="button"
      key={mention.start}
      className={[className, inRange && selectedClassName].filter(Boolean).join(" ") || undefined}
      data-in-range={inRange || undefined}
      aria-label={`動画の${original}へ移動して再生${inRange ? "（選択範囲内）" : ""}`}
      onClick={() => onTimestampSelect(mention.seconds)}
    >{original}</button>);
    cursor = mention.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Fragment>{parts}</Fragment>;
}
