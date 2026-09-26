import assert from "node:assert/strict";
import test from "node:test";
import { createPlaybackStore, seekYouTubePlayer, youtubeTimestampUrl, type YouTubeControlTarget } from "../lib/youtube-player-control";

function fakePlayer(state: number) {
  const calls: unknown[][] = [];
  const player: YouTubeControlTarget = {
    getPlayerState: () => state,
    cueVideoById: (options) => calls.push(["cue", options]),
    loadVideoById: (options) => calls.push(["load", options]),
    seekTo: (seconds, ahead) => calls.push(["seek", seconds, ahead]),
    playVideo: () => calls.push(["play"]),
    pauseVideo: () => calls.push(["pause"]),
  };
  return { player, calls };
}

test("passive selection cues unstarted, ended, or cued videos without triggering autoplay", () => {
  for (const state of [-1, 0, 5]) {
    const { player, calls } = fakePlayer(state);
    seekYouTubePlayer(player, "example", 204, false);
    assert.deepEqual(calls, [["cue", { videoId: "example", startSeconds: 204 }]]);
  }
});

test("passive selection retains pause or ongoing playback and buffering", () => {
  for (const state of [1, 2, 3]) {
    const { player, calls } = fakePlayer(state);
    seekYouTubePlayer(player, "example", 204, false);
    assert.deepEqual(calls, [["seek", 204, true]]);
  }
});

test("explicit scene and timestamp actions start playback from the requested second", () => {
  for (const state of [-1, 0, 5]) {
    const { player, calls } = fakePlayer(state);
    seekYouTubePlayer(player, "example", 204, true);
    assert.deepEqual(calls, [["load", { videoId: "example", startSeconds: 204 }]]);
  }
  for (const state of [1, 2, 3]) {
    const { player, calls } = fakePlayer(state);
    seekYouTubePlayer(player, "example", 204, true);
    assert.deepEqual(calls, [["seek", 204, true], ["play"]]);
  }
});

test("invalid seeks do not reach the player", () => {
  const { player, calls } = fakePlayer(1);
  for (const seconds of [-1, NaN, Infinity]) seekYouTubePlayer(player, "example", seconds, true);
  assert.deepEqual(calls, []);
  seekYouTubePlayer(player, "example", 0, false);
  assert.deepEqual(calls, [["seek", 0, true]]);
});

test("playback store delivers changes only to current subscribers and ignores invalid readings", () => {
  const store = createPlaybackStore();
  const values: number[] = [];
  const unsubscribe = store.subscribe(() => values.push(store.getSnapshot()));
  assert.equal(store.getSnapshot(), 0);
  store.set(204);
  store.set(204);
  store.set(NaN);
  store.set(Infinity);
  store.set(-1);
  store.set(205);
  unsubscribe();
  store.set(206);
  assert.deepEqual(values, [204, 205]);
  assert.equal(store.getSnapshot(), 206);
});

test("external fallback keeps a safe, explicit timestamp", () => {
  assert.equal(youtubeTimestampUrl("example", 204.9), "https://www.youtube.com/watch?v=example&t=204s");
  assert.equal(youtubeTimestampUrl("example", NaN), "https://www.youtube.com/watch?v=example&t=0s");
});
