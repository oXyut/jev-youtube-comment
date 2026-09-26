/**
 * The Score probability keys are ordinal positions 0–4. These anchors define
 * the numeric spacing used only when projecting the two independent scores.
 */
export const valenceStages = [
  { level: 0, anchor: -2, label: "強く批判的", description: "強い否定・批判・不満が中心" },
  { level: 1, anchor: -1, label: "やや批判的", description: "批判・不満があるが、強さは限定的" },
  { level: 2, anchor: 0, label: "中立", description: "評価や感情をほぼ含まず、事実・質問などが中心" },
  { level: 3, anchor: 1, label: "やや好意的", description: "肯定・共感・期待があるが、強さは限定的" },
  { level: 4, anchor: 2, label: "強く好意的", description: "強い称賛・喜び・支持が中心" },
] as const;

export const heatStages = [
  { level: 0, anchor: 0, label: "冷静", description: "淡々とした説明や事実の提示" },
  { level: 1, anchor: 1, label: "少し感情的", description: "軽い感情表現や関心が見える" },
  { level: 2, anchor: 2, label: "感情が見える", description: "感情や評価がはっきり表現されている" },
  { level: 3, anchor: 3, label: "熱量が高い", description: "強い感情、強調、勢いが目立つ" },
  { level: 4, anchor: 4, label: "非常に熱量が高い", description: "極めて強い感情や強調が表れている" },
] as const;

export type ProbabilityByLevel = Record<string, number>;

export function weightedMean(probabilities: ProbabilityByLevel, stages: readonly { level: number; anchor: number }[]) {
  return stages.reduce((sum, stage) => sum + (probabilities[String(stage.level)] ?? 0) * stage.anchor, 0);
}

/** Discrete equal-tailed interval from the p10 stage to the p90 stage. */
export function central80Interval(probabilities: ProbabilityByLevel, stages: readonly { level: number; anchor: number }[]) {
  const quantile = (target: number) => {
    let cumulative = 0;
    for (const stage of stages) {
      cumulative += probabilities[String(stage.level)] ?? 0;
      if (cumulative >= target) return stage.anchor;
    }
    return stages.at(-1)?.anchor ?? 0;
  };
  return { low: quantile(0.1), high: quantile(0.9) };
}
