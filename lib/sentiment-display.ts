import { toneColors, type Tone } from "./analysis";

// Means have a continuous scale; comment categories keep their existing thresholds.
export const meanSentimentColors = {
  negative: toneColors.critical,
  zero: "#EEF0F2",
  positive: toneColors.positive,
} as const;

export const meanSentimentGradient = `linear-gradient(90deg, ${meanSentimentColors.negative} 0%, ${meanSentimentColors.zero} 50%, ${meanSentimentColors.positive} 100%)`;

export function meanSentimentColor(value: number): string {
  const score = Number.isFinite(value) ? Math.max(-2, Math.min(2, value)) : 0;
  const edge = score < 0 ? meanSentimentColors.negative : meanSentimentColors.positive;
  const amount = Math.abs(score) / 2;
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return "#" + [1, 3, 5].map(offset => {
    const center = channel(meanSentimentColors.zero, offset);
    return Math.round(center + (channel(edge, offset) - center) * amount).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

/** Full-circle shares preserve the distribution even when its mean cancels out. */
export function sentimentRingSegments(counts: Record<Tone, number>) {
  const tones: Tone[] = ["critical", "center", "positive"];
  const total = tones.reduce((sum, tone) => sum + counts[tone], 0);
  let offset = 0;
  return tones.flatMap(tone => {
    if (!total || !counts[tone]) return [];
    const share = counts[tone] / total * 100;
    const segment = { tone, share, offset };
    offset += share;
    return [segment];
  });
}
