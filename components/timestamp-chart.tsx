"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { toneColors, toneLabels, type Tone } from "@/lib/analysis";
import { timestampLineSegments, type TimeRange, type TimestampBin } from "@/lib/timestamp-aggregation";
import { formatTimestamp } from "@/lib/timestamps";
import type { PlaybackStore } from "./youtube-player";
import styles from "./timestamp-analysis.module.css";

const tones: Tone[] = ["positive", "critical", "center"];
const LEFT = 43, RIGHT = 16, TOP = 18, BOTTOM = 184, BAR_TOP = 218, BAR_BOTTOM = 263;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** Only this small child subscribes to playback; analysis and comments do not rerender on ticks. */
function PlaybackLine({ store, viewport, width }: { store: PlaybackStore; viewport: TimeRange; width: number }) {
  const seconds = useSyncExternalStore(store.subscribe, store.getSnapshot, () => 0);
  if (seconds < viewport.startSeconds || seconds > viewport.endSeconds) return null;
  const x = LEFT + (seconds - viewport.startSeconds) / (viewport.endSeconds - viewport.startSeconds) * (width - LEFT - RIGHT);
  return <g pointerEvents="none" aria-hidden="true"><line x1={x} x2={x} y1={TOP} y2={BAR_BOTTOM} stroke="#1769cf" strokeWidth="1.5" /><path d={`M ${x - 4} 8 L ${x + 4} 8 L ${x} 15 Z`} fill="#1769cf" /></g>;
}

export function TimestampChart({ bins, viewport, selectedRange, onRange, onSelectBin, playbackStore }: {
  bins: TimestampBin[]; viewport: TimeRange; selectedRange: TimeRange | null;
  onRange: (range: TimeRange) => void; onSelectBin: (range: TimeRange) => void; playbackStore: PlaybackStore;
}) {
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  const [preview, setPreview] = useState<TimeRange | null>(null);
  const drag = useRef<{ anchor: number; pixel: number; handle?: "startSeconds" | "endSeconds"; moved: boolean; range: TimeRange | null } | null>(null);
  const clipId = useId().replace(/:/g, "");
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(Math.max(220, entry.contentRect.width)); });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setHover(null); setPreview(null); }, [bins, viewport]);
  const plotWidth = width - LEFT - RIGHT;
  const x = (seconds: number) => LEFT + (seconds - viewport.startSeconds) / (viewport.endSeconds - viewport.startSeconds) * plotWidth;
  const y = (percent: number) => BOTTOM - percent / 100 * (BOTTOM - TOP);
  const visibleBins = bins.filter(bin => bin.endSeconds > viewport.startSeconds && bin.startSeconds < viewport.endSeconds);
  const maxCount = Math.max(1, ...visibleBins.map(bin => bin.total));
  const currentRange = preview ?? selectedRange;
  const hovered = hover === null ? null : bins[hover];
  const marked = hovered ?? bins.find(bin => selectedRange?.startSeconds === bin.startSeconds && selectedRange.endSeconds === bin.endSeconds);
  const indexAt = (seconds: number) => bins.findIndex(bin => seconds >= bin.startSeconds && seconds < bin.endSeconds);
  function timeAt(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return clamp(viewport.startSeconds + ((event.clientX - rect.left) * width / rect.width - LEFT) / plotWidth * (viewport.endSeconds - viewport.startSeconds), viewport.startSeconds, viewport.endSeconds);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const seconds = timeAt(event);
    setHover(indexAt(Math.min(seconds, viewport.endSeconds - .001)));
    const current = drag.current;
    if (!current) return;
    if (Math.abs(event.clientX - current.pixel) > 4) current.moved = true;
    if (!current.moved) return;
    const value = Math.round(seconds);
    let next: TimeRange;
    if (current.handle && current.range) {
      next = { ...current.range, [current.handle]: current.handle === "startSeconds" ? Math.min(value, current.range.endSeconds - 1) : Math.max(value, current.range.startSeconds + 1) };
    } else next = { startSeconds: Math.min(current.anchor, value), endSeconds: Math.max(current.anchor, value) };
    if (!current.handle) next = { startSeconds: Math.max(viewport.startSeconds, next.startSeconds), endSeconds: Math.min(viewport.endSeconds, next.endSeconds) };
    current.range = current.handle ? current.range : next;
    setPreview(next);
  }
  const ticks = width < 500 ? 2 : 4;
  return <div ref={host} className={styles.chart}>
    <svg ref={svg} width="100%" height="292" viewBox={`0 0 ${width} 292`} role="group" aria-label="動画内の感情割合とコメント件数。左右キーで区間を参照、Enterで選択。ドラッグで任意範囲を指定。" tabIndex={0}
      onKeyDown={event => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const first = bins.indexOf(visibleBins[0]), last = bins.indexOf(visibleBins[visibleBins.length - 1]);
          setHover(event.key === "Home" ? first : event.key === "End" ? last : clamp((hover ?? first) + (event.key === "ArrowLeft" ? -1 : 1), first, last));
        } else if ((event.key === "Enter" || event.key === " ") && hovered) { event.preventDefault(); onSelectBin(hovered); }
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const seconds = timeAt(event);
        const handle = (event.target as Element).getAttribute("data-handle") as "startSeconds" | "endSeconds" | null;
        drag.current = { anchor: Math.round(seconds), pixel: event.clientX, handle: handle ?? undefined, moved: false, range: selectedRange };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={move}
      onPointerUp={event => {
        const current = drag.current;
        drag.current = null;
        if (!current) return;
        if (current.moved && preview && preview.startSeconds < preview.endSeconds) onRange(preview);
        else if (!current.moved && !current.handle) { const bin = bins[indexAt(Math.min(timeAt(event), viewport.endSeconds - .001))]; if (bin) { setHover(bins.indexOf(bin)); onSelectBin(bin); } }
        setPreview(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={() => { drag.current = null; setPreview(null); }} onPointerLeave={() => { if (!drag.current) setHover(null); }}>
      <defs><clipPath id={clipId}><rect x={LEFT - 1} y={TOP - 5} width={plotWidth + 2} height={BAR_BOTTOM - TOP + 6} /></clipPath></defs>
      {[0, 50, 100].map(value => <g key={value}><text x={LEFT - 8} y={y(value) + 4} textAnchor="end" className={styles.axis}>{value}%</text><line x1={LEFT} x2={width - RIGHT} y1={y(value)} y2={y(value)} stroke="#e4e8ec" strokeDasharray={value === 0 ? undefined : "4 4"} /></g>)}
      <text x={LEFT} y={207} className={styles.axis}>コメント件数（最大{maxCount}件）</text>
      <g clipPath={`url(#${clipId})`}>
        {currentRange && <rect x={x(currentRange.startSeconds)} y={TOP} width={Math.max(0, x(currentRange.endSeconds) - x(currentRange.startSeconds))} height={BAR_BOTTOM - TOP} fill="#1769cf" opacity=".07" />}
        {visibleBins.map(bin => <rect key={bin.startSeconds} x={x(bin.startSeconds) + 1} y={BAR_BOTTOM - bin.total / maxCount * (BAR_BOTTOM - BAR_TOP)} width={Math.max(1, x(bin.endSeconds) - x(bin.startSeconds) - 2)} height={bin.total / maxCount * (BAR_BOTTOM - BAR_TOP)} fill="#b8bec5" />)}
        {tones.map(tone => {
          const segments = timestampLineSegments(bins, tone);
          return <g key={tone} fill="none" stroke={toneColors[tone]} strokeWidth={tone === "center" ? 1.5 : 2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={tone === "center" ? "6 5" : undefined}>
            {segments.map((points, index) => points.length === 1 ? <circle key={index} cx={x(points[0].midpointSeconds)} cy={y(points[0].percentages[tone]!)} r={3} fill={toneColors[tone]} strokeDasharray="none" /> : <polyline key={index} points={points.map(bin => `${x(bin.midpointSeconds)},${y(bin.percentages[tone]!)}`).join(" ")} />)}
            {marked && marked.percentages[tone] !== null && <circle cx={x(marked.midpointSeconds)} cy={y(marked.percentages[tone]!)} r={4} fill={toneColors[tone]} stroke="white" strokeDasharray="none" />}
          </g>;
        })}
        {hovered && <line x1={x(hovered.midpointSeconds)} x2={x(hovered.midpointSeconds)} y1={TOP} y2={BAR_BOTTOM} stroke="#738398" strokeDasharray="3 4" pointerEvents="none" />}
        <PlaybackLine store={playbackStore} viewport={viewport} width={width} />
        {currentRange && (["startSeconds", "endSeconds"] as const).map(handle => <g key={handle}>
          <line x1={x(currentRange[handle])} x2={x(currentRange[handle])} y1={TOP} y2={BAR_BOTTOM} stroke="#7088a6" strokeDasharray="4 3" />
          <rect data-handle={handle} x={x(currentRange[handle]) - 10} y={TOP} width={20} height={BAR_BOTTOM - TOP} fill="transparent" className={styles.handle} tabIndex={currentRange[handle] >= viewport.startSeconds && currentRange[handle] <= viewport.endSeconds ? 0 : -1} role="slider" aria-label={handle === "startSeconds" ? "分析範囲の開始" : "分析範囲の終了"} aria-valuemin={viewport.startSeconds} aria-valuemax={viewport.endSeconds} aria-valuenow={currentRange[handle]} aria-valuetext={formatTimestamp(currentRange[handle])} onKeyDown={event => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault(); event.stopPropagation();
            const value = currentRange[handle] + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1);
            const next = { ...currentRange, [handle]: clamp(value, handle === "startSeconds" ? viewport.startSeconds : currentRange.startSeconds + 1, handle === "endSeconds" ? viewport.endSeconds : currentRange.endSeconds - 1) };
            onRange(next);
          }} />
          <rect x={x(currentRange[handle]) - 3} y={TOP + 70} width={6} height={24} rx={3} fill="#7088a6" pointerEvents="none" />
        </g>)}
      </g>
      <line x1={LEFT} x2={width - RIGHT} y1={BAR_BOTTOM} y2={BAR_BOTTOM} stroke="#cbd1d8" />
      <text x={LEFT - 8} y={BAR_BOTTOM + 4} textAnchor="end" className={styles.axis}>0</text>
      {Array.from({ length: ticks + 1 }, (_, index) => {
        const seconds = viewport.startSeconds + (viewport.endSeconds - viewport.startSeconds) * index / ticks;
        return <text key={index} x={x(seconds)} y={284} textAnchor={index === 0 ? "start" : index === ticks ? "end" : "middle"} className={styles.axis}>{formatTimestamp(Math.floor(seconds))}</text>;
      })}
    </svg>
    <div className={styles.hoverDetails} aria-live="off">
      {hovered ? <><b>{formatTimestamp(hovered.startSeconds)}–{formatTimestamp(hovered.endSeconds)} · {hovered.total}件</b>{tones.map(tone => <span key={tone}>{toneLabels[tone]} {hovered.percentages[tone] === null ? "—" : `${Math.round(hovered.percentages[tone]!)}%`} · {hovered.counts[tone]}件</span>)}{hovered.counts.unknown > 0 && <span>感情未取得 {Math.round(hovered.percentages.unknown!)}% · {hovered.counts.unknown}件</span>}</> : <span>区間に触れると割合と実数を表示 · 左右キーで参照、Enterで選択</span>}
    </div>
  </div>;
}
