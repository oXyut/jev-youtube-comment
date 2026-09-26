"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { PlayArrow, ZoomIn, ZoomOutMap } from "@mui/icons-material";
import { toneColors, toneLabels, type Item, type Tone, type Video } from "@/lib/analysis";
import { aggregateBins, buildTimestampIndex, summarizeRange, type TimeRange } from "@/lib/timestamp-aggregation";
import { formatTimestamp, parseTimestampInput } from "@/lib/timestamps";
import { CommentsView } from "./comments-view";
import { TimestampChart } from "./timestamp-chart";
import { createPlaybackStore, YouTubePlayer, type YouTubePlayerHandle } from "./youtube-player";
import styles from "./timestamp-analysis.module.css";

const tones: Tone[] = ["positive", "center", "critical"];
const rangeLabel = (range: TimeRange | null) => range ? `${formatTimestamp(range.startSeconds)}–${formatTimestamp(range.endSeconds)}` : "全体";

export function TimestampAnalysis({ video, items, allItems, active, onDuration }: {
  video: Video; items: Item[]; allItems: Item[]; active: boolean; onDuration: (seconds: number) => void;
}) {
  const [binSeconds, setBinSeconds] = useState(60);
  const [selectedRange, setSelectedRange] = useState<TimeRange | null>(null);
  const [viewportRange, setViewportRange] = useState<TimeRange | null>(null);
  const [sort, setSort] = useState("time");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startInput, setStartInput] = useState("0:00");
  const [endInput, setEndInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [fallbackSeconds, setFallbackSeconds] = useState(0);
  const [playbackStore] = useState(createPlaybackStore);
  const player = useRef<YouTubePlayerHandle>(null);
  const inputsDirty = useRef(false);
  const duration = video.durationSeconds ?? null;
  const allIndex = useMemo(() => buildTimestampIndex(allItems, duration), [allItems, duration]);
  const index = useMemo(() => buildTimestampIndex(items, duration), [items, duration]);
  const endSeconds = useMemo(() => {
    if (duration) return duration;
    const last = allIndex.entries.reduce((maximum, entry) => Math.max(maximum, ...entry.mentions.map(mention => mention.seconds)), -1);
    return last >= 0 ? (Math.floor(last / binSeconds) + 1) * binSeconds : 0;
  }, [allIndex, binSeconds, duration]);
  const bins = useMemo(() => aggregateBins(index.entries, binSeconds, endSeconds), [index, binSeconds, endSeconds]);
  const summary = useMemo(() => summarizeRange(index.entries, selectedRange), [index, selectedRange]);
  const sorted = useMemo(() => sort === "likes" ? [...summary.items].sort((a, b) => b.likeCount - a.likeCount || a.id.localeCompare(b.id)) : summary.items, [summary, sort]);
  const outsideDuration = Boolean(selectedRange && duration && selectedRange.endSeconds > duration);
  const viewport = useMemo(() => {
    if (!viewportRange) return { startSeconds: 0, endSeconds };
    const end = Math.min(viewportRange.endSeconds, endSeconds);
    return { startSeconds: Math.min(viewportRange.startSeconds, Math.max(0, end - 1)), endSeconds: end };
  }, [viewportRange, endSeconds]);
  const resetKey = selectedRange ? `${selectedRange.startSeconds}:${selectedRange.endSeconds}` : "all";
  useEffect(() => {
    if (selectedId && !summary.items.some(item => item.id === selectedId)) setSelectedId(null);
  }, [summary, selectedId]);
  useEffect(() => {
    if (inputsDirty.current) return;
    setStartInput(formatTimestamp(selectedRange?.startSeconds ?? 0));
    setEndInput(endSeconds > 0 ? formatTimestamp(selectedRange?.endSeconds ?? endSeconds) : "");
    setInputError("");
  }, [selectedRange, endSeconds]);
  const changeRange = useCallback((range: TimeRange | null) => {
    inputsDirty.current = false;
    setSelectedRange(range ? { startSeconds: range.startSeconds, endSeconds: range.endSeconds } : null);
    setSelectedId(null);
  }, []);
  const seek = useCallback((seconds: number, play: boolean) => {
    setFallbackSeconds(seconds);
    player.current?.seek(seconds, play);
  }, []);
  function selectBin(range: TimeRange) { changeRange(range); seek(range.startSeconds, false); }
  function applyRange() {
    const start = parseTimestampInput(startInput), end = parseTimestampInput(endInput);
    if (start === null || end === null) { setInputError("開始・終了は 3:24、1:02:03 または秒数で入力してください。"); return; }
    if (start >= end) { setInputError("開始は終了より前にしてください（終了の時刻は範囲に含みません）。"); return; }
    if (duration && end > duration) { setInputError(`終了は動画尺 ${formatTimestamp(duration)} 以下にしてください。`); return; }
    setInputError(""); changeRange({ startSeconds: start, endSeconds: end });
  }
  function moveBin(direction: -1 | 1) {
    const base = selectedRange ? Math.floor(selectedRange.startSeconds / binSeconds) + direction : direction === 1 ? 0 : bins.length - 1;
    const bin = bins[Math.max(0, Math.min(bins.length - 1, base))];
    if (bin) selectBin(bin);
  }
  const noTimestamps = index.entries.length === 0;
  return <Box component="section" aria-label="時間付きコメントの分析" sx={{ pt: 1 }}>
    <Typography variant="body2" color="text.secondary">
      共通条件の対象 {items.length.toLocaleString()}件 · 時間表記あり <b>{index.entries.length.toLocaleString()}件</b>
      {items.length > 0 && `（${(index.entries.length / items.length * 100).toFixed(1)}%）`}
      {index.excludedCount > 0 && ` · 動画尺外の時間表記 ${index.excludedCount}件を除外`}
    </Typography>
    {!duration && <Typography variant="caption" color="text.secondary">動画尺未取得{endSeconds > 0 ? "・最後の時間表記まで表示しています。" : "・有効な時間表記はまだありません。"}</Typography>}
    <div className={styles.top}>
      <YouTubePlayer ref={player} videoId={video.id} active={active} onDuration={onDuration} playbackStore={playbackStore} fallbackSeconds={fallbackSeconds} />
      <div className={styles.rangePanel}>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>分析範囲 <span>{rangeLabel(selectedRange)}</span></Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>本文の時間表記から、この場面に言及するコメントを確認します。</Typography>
        <Box component="form" onSubmit={event => { event.preventDefault(); applyRange(); }}>
          <div className={styles.inputs}>
            <TextField label="開始時刻" value={startInput} onChange={event => { inputsDirty.current = true; setStartInput(event.target.value); }} placeholder="0:00" error={Boolean(inputError)} slotProps={{ htmlInput: { inputMode: "text", "aria-describedby": "timestamp-range-help", autoComplete: "off" } }} />
            <TextField label="終了時刻" value={endInput} onChange={event => { inputsDirty.current = true; setEndInput(event.target.value); }} placeholder="3:24" error={Boolean(inputError)} slotProps={{ htmlInput: { inputMode: "text", "aria-describedby": "timestamp-range-help", autoComplete: "off" } }} />
          </div>
          <Typography id="timestamp-range-help" variant="caption" color="text.secondary">開始を含み、終了を含まない範囲です。秒数でも入力できます。</Typography>
          <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: "wrap" }}><Button type="submit" variant="outlined">範囲を適用</Button><Button onClick={() => changeRange(null)} disabled={!selectedRange}>分析範囲を全体に戻す</Button></Stack>
        </Box>
        {inputError && <Alert severity="error" sx={{ mt: 1 }}>{inputError}</Alert>}
        {outsideDuration && <Alert severity="warning" sx={{ mt: 1 }}>動画尺は {formatTimestamp(duration!)} でした。選択範囲を保持しています。終了時刻を修正してください。</Alert>}
        <Stack direction="row" sx={{ gap: 1, mt: 1.5, flexWrap: "wrap" }}>
          <Button size="small" disabled={!bins.length || selectedRange?.startSeconds === 0} onClick={() => moveBin(-1)}>前の区間</Button>
          <Button size="small" disabled={!bins.length || Boolean(selectedRange && selectedRange.endSeconds >= endSeconds)} onClick={() => moveBin(1)}>次の区間</Button>
        </Stack>
      </div>
    </div>
    <div className={styles.chartHeader}>
      <div><Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>動画内の反応</Typography><Typography variant="body2" color="text.secondary">時間への言及があるコメントの感情割合</Typography></div>
      <ToggleButtonGroup exclusive size="small" value={binSeconds} onChange={(_, value: number | null) => { if (value) setBinSeconds(value); }} aria-label="集計幅">
        {[30, 60, 120].map(value => <ToggleButton key={value} value={value} aria-label={`集計幅${value}秒`}>{value}秒</ToggleButton>)}
      </ToggleButtonGroup>
    </div>
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <div className={styles.legend}>{(["positive", "critical", "center"] as Tone[]).map(tone => <span key={tone}><i style={{ borderColor: toneColors[tone], borderTopStyle: tone === "center" ? "dashed" : "solid", borderTopWidth: tone === "center" ? 1.5 : 3 }} />{toneLabels[tone]}</span>)}<span><i style={{ borderColor: "#1769cf", width: 12, borderTopWidth: 1.5 }} />再生位置</span></div>
      <Stack direction="row" sx={{ gap: .5, flexWrap: "wrap" }}><Button size="small" startIcon={<ZoomIn />} disabled={!selectedRange || outsideDuration || selectedRange.startSeconds >= endSeconds || !bins.length} onClick={() => setViewportRange(selectedRange)}>選択範囲を拡大</Button><Button size="small" startIcon={<ZoomOutMap />} disabled={!viewportRange} onClick={() => setViewportRange(null)}>全体表示</Button></Stack>
    </Stack>
    {bins.length > 0 && !noTimestamps ? <TimestampChart bins={bins} viewport={viewport} selectedRange={selectedRange} onRange={changeRange} onSelectBin={selectBin} playbackStore={playbackStore} /> : <Alert severity="info" sx={{ my: 2 }}>
      {items.length === 0 ? "共通条件に一致するコメントがありません。条件を変更・解除してください。" : noTimestamps ? "対象コメントに有効な時間表記がありません。時刻を含まないコメントは通常の「コメント」タブで確認できます。" : "表示期間が長いためグラフを省略しています。動画の長さを確認し、下の時刻付きコメント一覧をご利用ください。"}
    </Alert>}
    <div className={styles.summary} aria-live="polite" aria-atomic="true">
      <b>{rangeLabel(selectedRange)} · {summary.total.toLocaleString()}件</b>
      {tones.map(tone => <span key={tone}><i style={{ background: toneColors[tone] }} />{toneLabels[tone]} <b>{summary.percentages[tone] === null ? "—" : `${Math.round(summary.percentages[tone]!)}%`}</b> · {summary.counts[tone]}件</span>)}
      {summary.counts.unknown > 0 && <span>感情未取得 {Math.round(summary.percentages.unknown!)}% · {summary.counts.unknown}件</span>}
      <Button startIcon={<PlayArrow />} disabled={outsideDuration || !endSeconds} onClick={() => seek(selectedRange?.startSeconds ?? 0, true)}>この場面を動画で確認</Button>
    </div>
    <Typography variant="caption" component="p" color="text.secondary">感情はコメント全体の分析です。中央帯は中立を保証しません。割合の分母は感情未取得を含む全件数です。同じコメントが複数区間に現れるため、棒の合計は全体件数と一致しません。</Typography>
    <div className={styles.commentHeading}>
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>{selectedRange ? "この範囲のコメント" : "時間表記のあるコメント"}</Typography>
      <TextField select label="時間帯別の並び順" value={sort} onChange={event => setSort(event.target.value)} sx={{ minWidth: 195 }}><MenuItem value="time">範囲内の時間が早い順</MenuItem><MenuItem value="likes">いいねが多い順</MenuItem></TextField>
    </div>
    {!summary.total && selectedRange && <Alert severity="info" sx={{ mb: 2 }}>この範囲に言及するコメントはありません。開始・終了時刻または共通条件を変更してください。</Alert>}
    <CommentsView items={sorted} selectedId={selectedId} onSelect={setSelectedId} resetKey={resetKey} active={active} timestampRange={selectedRange} durationSeconds={duration} onTimestampSelect={seconds => seek(seconds, true)} />
  </Box>;
}
