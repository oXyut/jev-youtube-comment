/** Percentage choices use the video count shown when the user confirms. */
export type CommentScope =
  | { scope: "first100" }
  | { scope: "all" }
  | { scope: "count"; limit: number }
  | { scope: "percentage"; percentage: number; basisCount: number };

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseCommentScope(raw: Record<string, unknown>): CommentScope {
  switch (raw.scope) {
    case "first100":
    case "all":
      if (raw.limit === undefined && raw.percentage === undefined && raw.basisCount === undefined) return { scope: raw.scope };
      break;
    case "count":
      if (isPositiveInteger(raw.limit) && raw.percentage === undefined && raw.basisCount === undefined) return { scope: "count", limit: raw.limit };
      break;
    case "percentage":
      if (isPositiveInteger(raw.percentage) && raw.percentage <= 100 && isPositiveInteger(raw.basisCount) && raw.limit === undefined) {
        return { scope: "percentage", percentage: raw.percentage, basisCount: raw.basisCount };
      }
      break;
  }
  throw new Error("分析範囲を確認してください。件数は1以上の整数、割合は1〜100%の整数で指定してください。");
}

export function commentLimit(selection: CommentScope): number | undefined {
  if (selection.scope === "all") return undefined;
  if (selection.scope === "first100") return 100;
  if (selection.scope === "count") return selection.limit;
  // Integer arithmetic avoids overflow and floating-point rounding at exact percentages.
  return Math.floor(selection.basisCount / 100) * selection.percentage
    + Math.ceil((selection.basisCount % 100) * selection.percentage / 100);
}

export function formatCommentScope(selection: CommentScope): string {
  if (selection.scope === "all") return "全件";
  const count = commentLimit(selection)!.toLocaleString("ja-JP");
  return selection.scope === "percentage"
    ? `${selection.percentage}%目安・先頭${count}件まで`
    : `先頭${count}件まで`;
}
