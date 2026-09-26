import { createHash } from "node:crypto";
import packageInfo from "../package.json";
import type { AnalysisMetadata } from "./analysis-archive";
import type { RawComment } from "@/lib/youtube";
import { heatStages, valenceStages, type ProbabilityByLevel } from "@/lib/scales";

export type ClassifiedComment = RawComment & {
  gender: string;
  age: string;
  genderProbability: number;
  ageProbability: number;
  genderProbabilities: Record<string, number>;
  ageProbabilities: Record<string, number>;
  valenceProbabilities: ProbabilityByLevel;
  heatProbabilities: ProbabilityByLevel;
  valenceConfidence: number | null;
  heatConfidence: number | null;
  bothSidesProbability: number | null;
};

export type JevUsage = { inputTokens: number; outputTokens: number };
export type ClassifiedResult = { item: ClassifiedComment; usage: JevUsage };

const labels = {
  gender: ["masculine_coded", "feminine_coded", "ambiguous"] as const,
  age: ["pre_elementary", "middle_high_school", "university", "working_adult", "middle_older"] as const,
};

function distribution(value: unknown, options: readonly string[]): Record<string, number> {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const entries = options.map((key) => {
    const probability = Number(raw[key] ?? 0);
    return [key, Number.isFinite(probability) ? Math.max(0, probability) : 0] as const;
  });
  const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
  if (!total) return Object.fromEntries(options.map((key) => [key, 0]));
  return Object.fromEntries(entries.map(([key, probability]) => [key, probability / total]));
}

function finiteScore(value: unknown): number | null {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function unitValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const result = finiteScore(value);
  return result === null ? null : Math.max(0, Math.min(1, result));
}

const scoreLevels = (stages: readonly { description: string }[]) => stages.map((stage) => stage.description);
export const classificationQuestions = {
      valence: { type: "score", instructions: "コメント本文が表す評価の向きを、批判的から好意的までの一つの軸で評価してください。書き手の本心ではなく文章上の表現を見てください。評価がない事実・質問・淡々とした記述は中央の中立にしてください。肯定と批判の両方を含む場合も、この軸では全体としての向きを評価し、両方を含むかは別の質問で判定します。", criteria: scoreLevels(valenceStages) },
      heat: { type: "score", instructions: "コメント本文の表現上の感情の強さ・熱量を一つの軸で評価してください。好意的か批判的かは考慮せず、感情表現の強さだけを評価してください。", criteria: scoreLevels(heatStages) },
      both_sides: { type: "noul", instructions: "このコメントは、好意的な内容と批判的な内容の両方を含んでいますか？", criteria: { true: "同じコメント内に、好意・称賛・支持などの肯定的内容と、批判・不満・否定などの否定的内容の両方が明確に含まれる", false: "肯定的内容と否定的内容の両方は含まれない。一方だけ、どちらもない、または両方が明確ではない" } },
      gender: { type: "choice", instructions: "本人の性別を推測してはいけません。語尾、語彙、文体に基づく遊びの『文体印象』だけを分類し、判断材料が弱ければ必ずambiguousにしてください。本人属性の事実ではありません。", criteria: { masculine_coded: "文体だけを見ると、一般に男性的と受け取られやすい表現の印象", feminine_coded: "文体だけを見ると、一般に女性的と受け取られやすい表現の印象", ambiguous: "文面だけでは判断できない、または性別らしさを割り当てるべきでない" } },
      age: { type: "choice", instructions: "本人の実年齢を推定してはいけません。コメントの語彙、話題の捉え方、ネット文化の参照など文章表現から連想される年齢層・生活段階の印象を、次の5区分のうち最も近いものに分類してください。迷う場合も最も近い区分を選んでください。これは遊びの文体印象であり、本人属性の事実ではありません。", criteria: { pre_elementary: "小学生以下を連想させる語彙や話題の文体印象", middle_high_school: "中学生・高校生を連想させる語彙や話題の文体印象", university: "大学生を連想させる語彙や話題の文体印象", working_adult: "社会人を連想させる語彙や話題の文体印象", middle_older: "中年以上を連想させる語彙や話題の文体印象" } },
    };

export function getAnalyzerMetadata(): AnalysisMetadata["analyzer"] {
  const revision = process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA;
  return {
    provider: "typesafe.ai", model: process.env.JEV_MODEL || "jev-latest", definitionVersion: 1,
    definitionHash: createHash("sha256").update(JSON.stringify({ questions: classificationQuestions, valenceStages, heatStages })).digest("hex"),
    appVersion: packageInfo.version, gitCommit: revision && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(revision) ? revision : null,
  };
}

export async function classifyComment(comment: RawComment): Promise<ClassifiedResult> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY が設定されていません。");
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ state: { comment: comment.text }, model: process.env.JEV_MODEL || "jev-latest", questions: classificationQuestions }), cache: "no-store", signal: AbortSignal.timeout(20000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Jevで分類できませんでした。");
  const answers = data.answers ?? {};
  const usage = data.usage && typeof data.usage === "object" ? data.usage as Record<string, unknown> : {};
  const tokenCount = (value: unknown) => {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  };
  const genderProbabilities = distribution(answers.gender?.probabilities, labels.gender);
  const ageProbabilities = distribution(answers.age?.probabilities, labels.age);
  const scoreKeys = ["0", "1", "2", "3", "4"];
  const valenceProbabilities = distribution(answers.valence?.probabilities, scoreKeys);
  const heatProbabilities = distribution(answers.heat?.probabilities, scoreKeys);
  const gender = labels.gender.includes(answers.gender?.choice) ? answers.gender.choice : "ambiguous";
  const age = labels.age.includes(answers.age?.choice) ? answers.age.choice : labels.age.reduce((best, key) => ageProbabilities[key] > ageProbabilities[best] ? key : best, labels.age[0]);
  const item: ClassifiedComment = {
    ...comment, gender, age,
    genderProbability: genderProbabilities[gender] ?? 0,
    ageProbability: ageProbabilities[age] ?? 0,
    genderProbabilities, ageProbabilities,
    valenceProbabilities, heatProbabilities,
    valenceConfidence: unitValue(answers.valence?.confidence),
    heatConfidence: unitValue(answers.heat?.confidence),
    bothSidesProbability: unitValue(answers.both_sides?.noul),
  };
  return { item, usage: { inputTokens: tokenCount(usage.input_tokens), outputTokens: tokenCount(usage.output_tokens) } };
}
