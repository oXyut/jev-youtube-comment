import assert from "node:assert/strict";
import test from "node:test";
import { getComments, getVideoInfo, parseVideoDuration, parseVideoId } from "../lib/youtube";

function thread(id: string, author = true) {
  return {
    snippet: {
      topLevelComment: {
        id,
        snippet: {
          textDisplay: `本文 ${id}`, publishedAt: "2026-09-25T00:00:00Z", likeCount: 7,
          ...(author ? { authorChannelId: { value: "channel-1" }, authorDisplayName: "実際の表示名", authorProfileImageUrl: "https://example.test/avatar.jpg" } : {}),
        },
      },
    },
  };
}

test("YouTube URL forms remain supported", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=example1234&t=42", "https://youtu.be/example1234",
    "https://m.youtube.com/watch?v=example1234", "https://youtube.com/shorts/example1234",
    "https://youtube.com/embed/example1234", "https://youtube.com/live/example1234",
  ]) assert.equal(parseVideoId(url), "example1234");
  assert.equal(parseVideoId("https://example.test/watch?v=example1234"), null);
  assert.equal(parseVideoId("not a url"), null);
});

test("comments retain author metadata across relevance-ordered pagination", async (context) => {
  const previousKey = process.env.YOUTUBE_DATA_API_KEY;
  process.env.YOUTUBE_DATA_API_KEY = "test-only-key";
  context.after(() => previousKey === undefined ? delete process.env.YOUTUBE_DATA_API_KEY : process.env.YOUTUBE_DATA_API_KEY = previousKey);
  const requests: URL[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(url.origin + url.pathname, "https://www.googleapis.com/youtube/v3/commentThreads");
    return Response.json(requests.length === 1
      ? { items: [thread("one")], pageInfo: { totalResults: 2 }, nextPageToken: "page-two" }
      : { items: [thread("two", false)], pageInfo: { totalResults: 2 } });
  });
  const progress: number[][] = [];
  const result = await getComments("video-id", undefined, (loaded, total) => progress.push([loaded, total]));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get("pageToken"), "page-two");
  for (const url of requests) {
    assert.equal(url.searchParams.get("order"), "relevance");
    assert.equal(url.searchParams.get("textFormat"), "plainText");
    assert.equal(url.searchParams.get("videoId"), "video-id");
  }
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.equal(result.total, 2);
  assert.deepEqual(result.comments[0], {
    id: "one", text: "本文 one", publishedAt: "2026-09-25T00:00:00Z", likeCount: 7,
    authorChannelId: "channel-1", authorDisplayName: "実際の表示名", authorProfileImageUrl: "https://example.test/avatar.jpg",
  });
  assert.equal(result.comments[1].authorDisplayName, undefined);
  assert.equal(result.comments[1].authorProfileImageUrl, undefined);
  assert.equal(result.comments[1].authorChannelId, undefined);
});

test("comment limit avoids extra pages and API failures remain visible", async (context) => {
  const previousKey = process.env.YOUTUBE_DATA_API_KEY;
  process.env.YOUTUBE_DATA_API_KEY = "test-only-key";
  context.after(() => previousKey === undefined ? delete process.env.YOUTUBE_DATA_API_KEY : process.env.YOUTUBE_DATA_API_KEY = previousKey);
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({
    items: [thread("one"), thread("two"), thread("three")], pageInfo: { totalResults: 200 }, nextPageToken: "unused",
  }));
  const result = await getComments("video-id", 2);
  assert.deepEqual(result.comments.map((comment) => comment.id), ["one", "two"]);
  assert.equal(fetchMock.mock.calls.length, 1);
  fetchMock.mock.mockImplementation(async () => Response.json({ error: { message: "Comments disabled" } }, { status: 403 }));
  await assert.rejects(getComments("video-id"), /Comments disabled/);
});

test("video metadata still uses the actual API title, channel, thumbnail, and total", async (context) => {
  const previousKey = process.env.YOUTUBE_DATA_API_KEY;
  process.env.YOUTUBE_DATA_API_KEY = "test-only-key";
  context.after(() => previousKey === undefined ? delete process.env.YOUTUBE_DATA_API_KEY : process.env.YOUTUBE_DATA_API_KEY = previousKey);
  context.mock.method(globalThis, "fetch", async () => Response.json({ items: [{
    snippet: { title: "動画タイトル", channelTitle: "チャンネル", thumbnails: { medium: { url: "https://example.test/thumbnail.jpg" } } },
    statistics: { commentCount: "1240" },
  }] }));
  assert.deepEqual(await getVideoInfo("video-id"), {
    id: "video-id", title: "動画タイトル", channel: "チャンネル", thumbnail: "https://example.test/thumbnail.jpg", count: 1240,
  });
});

test("YouTube ISO duration accepts day/hour/minute/second values and leaves unavailable values unknown", () => {
  for (const [input, expected] of [["PT49M24S", 2964], ["PT1H2M3S", 3723], ["PT90M", 5400], ["P1DT2H", 93600], ["PT0.5S", 0.5]] as const) {
    assert.equal(parseVideoDuration(input), expected);
  }
  for (const input of [undefined, null, 0, "", "P", "PT", "PT0S", "PT-1S", "PTInfinityS", "P1DT", "49:24", "P1Y", `PT${"9".repeat(400)}S`]) {
    assert.equal(parseVideoDuration(input), undefined);
  }
});

test("video metadata requests contentDetails and includes only positive known durations", async (context) => {
  const previousKey = process.env.YOUTUBE_DATA_API_KEY;
  process.env.YOUTUBE_DATA_API_KEY = "test-only-key";
  context.after(() => previousKey === undefined ? delete process.env.YOUTUBE_DATA_API_KEY : process.env.YOUTUBE_DATA_API_KEY = previousKey);
  let duration = "PT49M24S";
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.ok(new URL(String(input)).searchParams.get("part")?.split(",").includes("contentDetails"));
    return Response.json({ items: [{ snippet: { title: "動画", channelTitle: "チャンネル" }, contentDetails: { duration } }] });
  });
  assert.equal((await getVideoInfo("video-id")).durationSeconds, 2964);
  duration = "PT0S";
  assert.equal(Object.hasOwn(await getVideoInfo("video-id"), "durationSeconds"), false);
});
