import { heatStages, valenceStages, weightedMean } from "./scales";
import type { RawComment } from "./youtube";

export type Item = RawComment & {
  gender: string;
  age: string;
  genderProbability: number;
  ageProbability: number;
  genderProbabilities: Record<string, number>;
  ageProbabilities: Record<string, number>;
  valenceProbabilities: Record<string, number>;
  heatProbabilities: Record<string, number>;
  valenceConfidence: number | null;
  heatConfidence: number | null;
  bothSidesProbability: number | null;
};

export type Video = { id: string; title: string; channel: string; thumbnail?: string; count: number; durationSeconds?: number };
export type Tone = "critical" | "center" | "positive";

export const genders = ["masculine_coded", "feminine_coded", "ambiguous"] as const;
// Keep the existing storage key for compatibility; pre_elementary now represents 小学生以下.
export const ages = ["pre_elementary", "middle_high_school", "university", "working_adult", "middle_older"] as const;

export const genderLabels: Record<string, string> = {
  masculine_coded: "男性的な文体", feminine_coded: "女性的な文体", ambiguous: "判定保留",
};
export const ageLabels: Record<string, string> = {
  pre_elementary: "小学生以下", middle_high_school: "中高生", university: "大学生", working_adult: "社会人", middle_older: "中年以上",
};
export const genderColors: Record<string, { background: string; text: string; bar: string }> = {
  masculine_coded: { background: "#E8F0FA", text: "#426483", bar: "#426483" },
  feminine_coded: { background: "#F9EBF0", text: "#86566B", bar: "#86566B" },
  ambiguous: { background: "#EEEEEE", text: "#606060", bar: "#606060" },
};
export const ageColors: Record<string, string> = {
  pre_elementary: "#F1F5EE", middle_high_school: "#E5EDD9", university: "#D7E4C5", working_adult: "#C3D6AE", middle_older: "#ACC493",
};
export const toneColors: Record<Tone, string> = { critical: "#BA6559", center: "#87919A", positive: "#438575" };
export const toneLabels: Record<Tone, string> = { critical: "批判寄り", center: "中央帯", positive: "好意寄り" };
export const BOTH_SIDES_THRESHOLD = 0.5;

export type Filters = {
  genders: string[];
  ageRange: [number, number];
  search: string;
  tone: "all" | Tone | "both";
  heatRange: [number, number];
};

/** Return new arrays so independent views cannot accidentally share mutable state. */
export function defaultFilters(): Filters {
  return { genders: [...genders], ageRange: [0, ages.length - 1], search: "", tone: "all", heatRange: [0, 4] };
}

export const valenceOf = (item: Item) => weightedMean(item.valenceProbabilities, valenceStages);
export const heatOf = (item: Item) => weightedMean(item.heatProbabilities, heatStages);

export function toneForScore(score: number): Tone {
  return score < -0.5 ? "critical" : score > 0.5 ? "positive" : "center";
}
export const toneOf = (item: Item): Tone => toneForScore(valenceOf(item));

export type Group = {
  key: string;
  gender: string;
  age: string;
  count: number;
  counts: Record<Tone, number>;
  meanValence: number;
  meanHeat: number;
};

export function groupInRange(group: Pick<Group, "gender" | "age">, filters: Filters): boolean {
  const ageIndex = ages.findIndex((age) => age === group.age);
  return ageIndex >= 0 && filters.genders.includes(group.gender)
    && ageIndex >= filters.ageRange[0] && ageIndex <= filters.ageRange[1];
}

/** Gender choices are OR; independent dimensions and every other filter are AND. */
export function filterItems(items: readonly Item[], filters: Filters): Item[] {
  const search = filters.search.trim().toLocaleLowerCase("ja");
  return items.filter((item) => {
    if (!groupInRange(item, filters)) return false;
    if (search && !item.text.toLocaleLowerCase("ja").includes(search)) return false;
    if (filters.tone === "both") {
      if ((item.bothSidesProbability ?? 0) < BOTH_SIDES_THRESHOLD) return false;
    } else if (filters.tone !== "all" && toneOf(item) !== filters.tone) return false;
    const heat = heatOf(item);
    return heat >= filters.heatRange[0] && heat <= filters.heatRange[1];
  });
}

export function toneCounts(items: readonly Item[]): Record<Tone, number> {
  const counts: Record<Tone, number> = { critical: 0, center: 0, positive: 0 };
  for (const item of items) counts[toneOf(item)]++;
  return counts;
}

/** Keep all category coordinates, including genuine zero-count cells. */
export function groupItems(items: readonly Item[]): Group[] {
  const groups = ages.flatMap((age) => genders.map((gender): Group => ({
    key: `${gender}:${age}`, gender, age, count: 0,
    counts: { critical: 0, center: 0, positive: 0 }, meanValence: 0, meanHeat: 0,
  })));
  const byKey = new Map(groups.map((group) => [group.key, group]));
  for (const item of items) {
    const group = byKey.get(`${item.gender}:${item.age}`);
    if (!group) continue;
    group.count++;
    group.counts[toneOf(item)]++;
    group.meanValence += valenceOf(item);
    group.meanHeat += heatOf(item);
  }
  for (const group of groups) {
    if (!group.count) continue;
    group.meanValence /= group.count;
    group.meanHeat /= group.count;
  }
  return groups;
}

/** Sorting changes only order; probability keys remain compatible with the original app. */
export function sortItems(items: readonly Item[], key: string, direction: "asc" | "desc"): Item[] {
  const [dimension, option] = key.split(":");
  const value = (item: Item): number => {
    if (dimension === "likes") return item.likeCount;
    if (dimension === "newest") return Date.parse(item.publishedAt) || 0;
    if (dimension === "valence") return option === undefined ? valenceOf(item) : item.valenceProbabilities[option] ?? 0;
    if (dimension === "heat") return option === undefined ? heatOf(item) : item.heatProbabilities[option] ?? 0;
    if (dimension === "gender") return item.genderProbabilities[option] ?? 0;
    if (dimension === "age") return item.ageProbabilities[option] ?? 0;
    if (dimension === "bothSides") return item.bothSidesProbability ?? 0;
    return 0;
  };
  return [...items].sort((left, right) => (value(left) - value(right)) * (direction === "asc" ? 1 : -1));
}
