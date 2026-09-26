import sampleGroups from "../reports/design-options-2026-09-26/revision-04/sample-groups.json";
import { ages, ageLabels, genders, genderLabels, type Item, type Tone, type Video } from "./analysis";

/** These are generated design fixtures, never comments fetched from YouTube. */
export const sampleVideo: Video = {
  id: "design-sample", title: "サンプル動画｜日々の暮らしを少し楽しくするアイデア", channel: "サンプルチャンネル（架空）", count: 1240,
};

const sampleTexts: Record<Tone, string[]> = {
  critical: [
    "説明のペースが少し速く、手順がわかりにくく感じました。もう少しゆっくり見せてほしいです。",
    "音楽が大きくて、肝心な説明が聞き取りづらかったです。",
    "紹介されていた方法を試しましたが、準備に思ったより時間がかかりました。",
  ],
  center: [
    "動画で使っている道具のサイズを教えていただけますか？",
    "最初の準備から片付けまで、全部で何分くらいかかりますか。",
    "材料と手順をメモしました。週末に確認してみます。",
  ],
  positive: [
    "身近なものを使うアイデアが参考になりました。さっそく試してみたいです！",
    "手順がまとまっていて、とてもわかりやすかったです。次の動画も楽しみにしています。",
    "見ているだけでも楽しいですね。家族と一緒にやってみようと思います。",
    "難しそうだと思っていましたが、これならできそうです。丁寧な説明をありがとうございます。",
    "好きだけど音が少し大きいと感じました。アイデア自体はとてもよかったです。",
  ],
};

/** Place mass on adjacent score stages to reproduce the desired mean exactly. */
function scoreDistribution(score: number, offset: number): Record<string, number> {
  const position = Math.max(0, Math.min(4, score + offset));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const probabilities: Record<string, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  probabilities[String(lower)] = 1 - (position - lower);
  if (upper !== lower) probabilities[String(upper)] = position - lower;
  return probabilities;
}

function categoryDistribution(options: readonly string[], selected: string): Record<string, number> {
  return Object.fromEntries(options.map((option) => [option, option === selected ? 0.8 : 0.2 / (options.length - 1)]));
}

let sequence = 0;
export const sampleItems: Item[] = sampleGroups.groups.flatMap((group) => {
  const gender = genders.find((key) => genderLabels[key] === group.gender)!;
  const age = ages.find((key) => ageLabels[key] === group.age)!;
  const criticalScore = -1.8;
  const positiveScore = group.positive ? (group.meanValence * group.count - criticalScore * group.critical) / group.positive : 0;
  return (["critical", "center", "positive"] as const).flatMap((tone) => Array.from({ length: group[tone] }, (_, index): Item => {
    const id = ++sequence;
    const textIndex = (id + index) % sampleTexts[tone].length;
    const mixed = tone === "positive" && textIndex === 4;
    const valence = tone === "critical" ? criticalScore : tone === "positive" ? positiveScore : 0;
    return {
      id: `sample-${String(id).padStart(3, "0")}`,
      text: sampleTexts[tone][textIndex],
      authorDisplayName: `サンプル投稿者 ${String(id).padStart(3, "0")}`,
      publishedAt: new Date(Date.UTC(2026, 8, 25, 12) - id * 3_600_000).toISOString(),
      likeCount: (id * 17 + 11) % 37,
      gender, age, genderProbability: 0.8, ageProbability: 0.8,
      genderProbabilities: categoryDistribution(genders, gender),
      ageProbabilities: categoryDistribution(ages, age),
      valenceProbabilities: scoreDistribution(valence, 2),
      heatProbabilities: scoreDistribution(0.6 + (id % 16) * 0.2, 0),
      valenceConfidence: 0.8, heatConfidence: 0.8,
      bothSidesProbability: mixed ? 0.82 : 0.04 + (id % 5) * 0.04,
    };
  }));
});
