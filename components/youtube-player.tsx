"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Alert, Box, Link, Typography } from "@mui/material";
import { seekYouTubePlayer, youtubeTimestampUrl, type PlaybackStore, type YouTubeControlTarget } from "@/lib/youtube-player-control";

export { createPlaybackStore, type PlaybackStore } from "@/lib/youtube-player-control";
export type YouTubePlayerHandle = { seek: (seconds: number, play: boolean) => void; pause: () => void };
type Player = YouTubeControlTarget & {
  getCurrentTime: () => number;
  getDuration: () => number;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
};
type PlayerEvent = { target: Player; data: number };
type YouTubeApi = {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    width: string;
    height: string;
    playerVars: { autoplay: number; playsinline: number; rel: number; origin: string };
    events: { onReady: (event: PlayerEvent) => void; onStateChange: (event: PlayerEvent) => void; onError: (event: PlayerEvent) => void; onAutoplayBlocked: () => void };
  }) => Player;
};
declare global { interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void } }

let apiPromise: Promise<YouTubeApi> | null = null;
function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const ownedScript = !script;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      script?.removeEventListener("error", failed);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previousReady;
    };
    const failed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ownedScript) script?.remove();
      reject(new Error("YouTubeプレイヤーを読み込めませんでした。"));
    };
    const ready = () => {
      if (settled) return;
      try { previousReady?.(); } catch { /* Other embeds must not prevent this player from loading. */ }
      if (!window.YT?.Player) return;
      settled = true;
      cleanup();
      resolve(window.YT);
    };
    const timeout = setTimeout(failed, 15000);
    window.onYouTubeIframeAPIReady = ready;
    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.addEventListener("error", failed, { once: true });
      document.head.appendChild(script);
    } else script.addEventListener("error", failed, { once: true });
  });
  apiPromise.catch(() => { apiPromise = null; });
  return apiPromise;
}

function errorMessage(code: number): string {
  if (code === 100) return "動画が削除されたか、非公開のため再生できません。";
  if (code === 101 || code === 150) return "この動画は画面内での再生が許可されていません。";
  return "YouTubeプレイヤーで動画を再生できません。外部リンクから確認できます。";
}

type Props = {
  videoId: string;
  active: boolean;
  onDuration: (seconds: number) => void;
  playbackStore: PlaybackStore;
  fallbackSeconds: number;
};

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer({ videoId, active, onDuration, playbackStore, fallbackSeconds }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const readyRef = useRef(false);
  const activeRef = useRef(active);
  const onDurationRef = useRef(onDuration);
  const pending = useRef<{ seconds: number; play: boolean } | null>(null);
  const lastDuration = useRef<number | null>(null);
  const [activated, setActivated] = useState(active);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalSeconds, setExternalSeconds] = useState(fallbackSeconds);
  activeRef.current = active;
  onDurationRef.current = onDuration;

  useImperativeHandle(ref, () => ({
    seek(seconds, play) {
      if (!Number.isFinite(seconds) || seconds < 0) return;
      const request = { seconds, play: play && activeRef.current };
      setExternalSeconds(seconds);
      playbackStore.set(seconds);
      if (player.current && readyRef.current) {
        if (!activeRef.current) player.current.pauseVideo();
        seekYouTubePlayer(player.current, videoId, seconds, request.play);
      }
      else pending.current = request;
    },
    pause() {
      if (pending.current) pending.current.play = false;
      if (readyRef.current) player.current?.pauseVideo();
    },
  }), [videoId, playbackStore]);

  useEffect(() => { if (active) setActivated(true); }, [active]);
  useEffect(() => { setExternalSeconds(fallbackSeconds); }, [fallbackSeconds]);

  useEffect(() => {
    if (!activated || !host.current) return;
    let cancelled = false;
    let ownedPlayer: Player | null = null;
    let readyTimeout: ReturnType<typeof setTimeout> | undefined;
    setError(null);
    setReady(false);
    readyRef.current = false;
    lastDuration.current = null;
    const target = document.createElement("div");
    host.current.replaceChildren(target);
    loadYouTubeApi().then((api) => {
      if (cancelled) return;
      readyTimeout = setTimeout(() => {
        if (!cancelled && !readyRef.current) setError("YouTubeプレイヤーの応答がありません。外部リンクから確認できます。");
      }, 15000);
      ownedPlayer = new api.Player(target, {
        videoId, width: "100%", height: "100%",
        playerVars: { autoplay: 0, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady(event) {
            if (cancelled) return;
            clearTimeout(readyTimeout);
            player.current = event.target;
            readyRef.current = true;
            setReady(true);
            setError(null);
            event.target.getIframe().title = "YouTube動画プレイヤー";
            if (pending.current) {
              seekYouTubePlayer(event.target, videoId, pending.current.seconds, pending.current.play && activeRef.current);
              pending.current = null;
            }
            if (!activeRef.current) event.target.pauseVideo();
          },
          onStateChange(event) {
            if (cancelled) return;
            if (!activeRef.current && (event.data === 1 || event.data === 3)) event.target.pauseVideo();
            if (activeRef.current && event.data === 1) setError(null);
          },
          onError(event) { if (!cancelled) { clearTimeout(readyTimeout); setError(errorMessage(event.data)); } },
          onAutoplayBlocked() { if (!cancelled) setError("ブラウザが再生開始を止めました。動画内の再生ボタンを押してください。"); },
        },
      });
      player.current = ownedPlayer;
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "YouTubeプレイヤーを読み込めませんでした。");
    });
    return () => {
      cancelled = true;
      clearTimeout(readyTimeout);
      readyRef.current = false;
      player.current = null;
      ownedPlayer?.destroy();
      target.remove();
    };
  }, [activated, videoId, playbackStore]);

  useEffect(() => {
    if (!active) {
      if (pending.current) pending.current.play = false;
      if (readyRef.current) player.current?.pauseVideo();
      return;
    }
    if (!ready) return;
    const sample = () => {
      const current = player.current;
      if (!current || !readyRef.current) return;
      const duration = current.getDuration();
      if (Number.isFinite(duration) && duration > 0 && duration !== lastDuration.current) {
        lastDuration.current = duration;
        onDurationRef.current(duration);
      }
      // A cued video may report zero until first playback; keep its prepared position.
      const state = current.getPlayerState();
      if (state !== -1 && state !== 5) playbackStore.set(current.getCurrentTime());
    };
    sample();
    const timer = setInterval(sample, 250);
    return () => { clearInterval(timer); };
  }, [active, ready, playbackStore]);

  return <Box sx={{ minWidth: 200 }}>
    <Box ref={host} sx={{ position: "relative", width: "100%", aspectRatio: "16 / 9", minWidth: 200, minHeight: 200, bgcolor: "#161B1E", borderRadius: 1.5, overflow: "hidden", "& iframe": { display: "block", width: "100%", height: "100%", minHeight: 200, border: 0 } }} />
    {error && <Alert severity="info" sx={{ mt: 1 }}>{error} 分析とコメント一覧は引き続き利用できます。</Alert>}
    {!ready && !error && active && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>動画を読み込み中…</Typography>}
    <Link href={youtubeTimestampUrl(videoId, externalSeconds)} target="_blank" rel="noopener noreferrer" sx={{ display: "inline-block", mt: 0.75, fontSize: 12 }}>この位置をYouTubeで開く ↗</Link>
  </Box>;
});
