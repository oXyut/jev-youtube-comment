import { isPositiveInteger } from "./comment-scope";

export function parseVideoId(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    return ["shorts", "embed", "live"].includes(parts[0] ?? "") ? parts[1] ?? null : null;
  } catch { return null; }
}
const api = "https://www.googleapis.com/youtube/v3";
function key() { return process.env.YOUTUBE_DATA_API_KEY; }
/** YouTube contentDetails.duration uses ISO 8601 days/hours/minutes/seconds. Unknown/zero stays absent. */
export function parseVideoDuration(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!match || !match.slice(1).some((part) => part !== undefined) || value.endsWith("T")) return undefined;
  const seconds = Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
export async function getVideoInfo(videoId: string) {
  if (!key()) throw new Error("YOUTUBE_DATA_API_KEY が設定されていません。");
  const url = new URL(api + "/videos");
  url.searchParams.set("part", "snippet,statistics,contentDetails"); url.searchParams.set("id", videoId); url.searchParams.set("key", key()!);
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? "YouTube APIで動画情報を取得できませんでした。");
  const item = body.items?.[0];
  if (!item) throw new Error("動画が見つからないか、公開されていません。");
  const durationSeconds = parseVideoDuration(item.contentDetails?.duration);
  return { id: videoId, title: item.snippet.title as string, channel: item.snippet.channelTitle as string, thumbnail: item.snippet.thumbnails?.medium?.url as string | undefined, count: Number(item.statistics?.commentCount ?? 0), ...(durationSeconds === undefined ? {} : { durationSeconds }) };
}
export type RawComment = {
  id: string;
  text: string;
  publishedAt: string;
  likeCount: number;
  authorChannelId?: string;
  authorDisplayName?: string;
  authorProfileImageUrl?: string;
};
export async function getComments(videoId: string, limit?: number, onPage?: (loaded: number, total: number) => void) {
  if (limit !== undefined && !isPositiveInteger(limit)) throw new Error("取得件数は1以上の整数で指定してください。");
  if (!key()) throw new Error("YOUTUBE_DATA_API_KEY が設定されていません。");
  const all: RawComment[] = []; let token = ""; let total = 0;
  do {
    const url = new URL(api + "/commentThreads");
    url.searchParams.set("part", "snippet"); url.searchParams.set("videoId", videoId); url.searchParams.set("maxResults", String(limit === undefined ? 100 : Math.min(100, limit - all.length))); url.searchParams.set("order", "relevance"); url.searchParams.set("textFormat", "plainText"); url.searchParams.set("key", key()!);
    if (token) url.searchParams.set("pageToken", token);
    const res = await fetch(url, { cache: "no-store" }); const body = await res.json();
    if (!res.ok) throw new Error(body.error?.message ?? "YouTubeコメントを取得できませんでした。");
    total = Number(body.pageInfo?.totalResults ?? total);
    for (const row of body.items ?? []) {
      const c = row.snippet?.topLevelComment;
      if (c) all.push({
        id: c.id, text: c.snippet?.textDisplay ?? "", publishedAt: c.snippet?.publishedAt ?? "",
        likeCount: Number(c.snippet?.likeCount ?? 0), authorChannelId: c.snippet?.authorChannelId?.value,
        authorDisplayName: c.snippet?.authorDisplayName,
        authorProfileImageUrl: c.snippet?.authorProfileImageUrl,
      });
      if (limit && all.length >= limit) break;
    }
    onPage?.(Math.min(all.length, total || all.length), total);
    token = body.nextPageToken ?? "";
  } while (token && (!limit || all.length < limit));
  return { comments: all, total };
}
