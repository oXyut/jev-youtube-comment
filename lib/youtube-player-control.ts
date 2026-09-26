export type PlaybackStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  set: (seconds: number) => void;
};

/** Player ticks notify the position marker without re-rendering comment aggregation. */
export function createPlaybackStore(): PlaybackStore {
  let seconds = 0;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => seconds,
    set(value) {
      if (!Number.isFinite(value) || value < 0 || value === seconds) return;
      seconds = value;
      listeners.forEach((listener) => listener());
    },
  };
}

export type YouTubeControlTarget = {
  getPlayerState: () => number;
  cueVideoById: (options: { videoId: string; startSeconds: number }) => void;
  loadVideoById: (options: { videoId: string; startSeconds: number }) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
};

/** False preserves transport state; true is an explicit request to start playback. */
export function seekYouTubePlayer(player: YouTubeControlTarget, videoId: string, seconds: number, play: boolean): void {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const state = player.getPlayerState();
  if (play) {
    if (state === -1 || state === 5 || state === 0) player.loadVideoById({ videoId, startSeconds: seconds });
    else { player.seekTo(seconds, true); player.playVideo(); }
  } else if (state === 1 || state === 2 || state === 3) {
    // YouTube guarantees seekTo retains paused state. Playing/buffering continue.
    player.seekTo(seconds, true);
  } else {
    // seekTo in a cued/unstarted/ended state would unexpectedly start playback.
    player.cueVideoById({ videoId, startSeconds: seconds });
  }
}

export function youtubeTimestampUrl(videoId: string, seconds: number): string {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  url.searchParams.set("t", `${Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds) : 0)}s`);
  return url.toString();
}
