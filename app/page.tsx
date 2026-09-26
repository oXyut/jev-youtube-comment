"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import YouTubeIcon from "@mui/icons-material/YouTube";
import SearchIcon from "@mui/icons-material/Search";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { AnalysisLibrary } from "@/components/analysis-library";
import type { AnalysisArchive, AnalysisMetadata, AnalysisSaveInput } from "@/lib/analysis-archive";
import packageInfo from "../package.json";
import { CommentFilters } from "@/components/comment-filters";
import { TimestampAnalysis } from "@/components/timestamp-analysis";
import { CommonFilters } from "@/components/common-filters";
import { CommentOverview } from "@/components/comment-overview";
import { CommentsView } from "@/components/comments-view";
import { Demographics } from "@/components/demographics";
import { ages, ageLabels, genders, genderLabels, defaultFilters, filterItems, groupItems, groupInRange, sortItems, type Filters, type Group, type Item, type Video } from "@/lib/analysis";
import { heatStages, valenceStages } from "@/lib/scales";
import { readJsonLines } from "@/lib/stream";

type Usage = { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
type StreamEvent = { type: string; item?: Item; message?: string; processed?: number; total?: number; speed?: number; failures?: number; elapsedMs?: number; usage?: Usage; startedAt?: string; completedAt?: string; analyzer?: AnalysisMetadata["analyzer"] };
const emptyUsage: Usage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function Home() {
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<Video | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [sample, setSample] = useState(false);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [failures, setFailures] = useState(0);
  const [usage, setUsage] = useState<Usage>(emptyUsage);
  const [provenance, setProvenance] = useState<Pick<AnalysisMetadata, "startedAt" | "completedAt" | "analyzer"> | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [autoSaveToken, setAutoSaveToken] = useState<string | null>(null);
  const [loadedSavedAt, setLoadedSavedAt] = useState<string | null>(null);
  const [scope, setScope] = useState<"first100" | "all">("first100");
  const [monitorExpanded, setMonitorExpanded] = useState(false);
  const [tab, setTab] = useState<"comments" | "demographics" | "timestamps">("comments");
  const [analysisGeneration, setAnalysisGeneration] = useState(0);
  const updateDuration = useCallback((durationSeconds: number) => {
    setVideo(current => current && current.durationSeconds === undefined ? { ...current, durationSeconds } : current);
  }, []);
  const [view, setView] = useState<"comparison" | "map">("comparison");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sortKey, setSortKey] = useState("likes");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(true);
  const [returnState, setReturnState] = useState<{ filters: Filters; view: "comparison" | "map"; selectedKey: string } | null>(null);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const visible = useMemo(() => filterItems(items, filters), [items, filters]);
  const sorted = useMemo(() => sortItems(visible, sortKey, sortDirection), [visible, sortKey, sortDirection]);
  const likeScaleMaximum = useMemo(() => items.reduce((max, item) => Math.max(max, item.likeCount), 0), [items]);
  const snapshot = useMemo<AnalysisSaveInput | null>(() => {
    if (!video || !items.length || (!sample && !provenance)) return null;
    return { video, items, analysis: {
      startedAt: provenance?.startedAt ?? null, completedAt: provenance?.completedAt ?? null,
      source: sample ? "sample" : "jev", status: analysisComplete ? "complete" : "partial", scope,
      order: "relevance", includeReplies: false, processed: items.length + failures,
      total: Math.max(total, items.length + failures), failures, elapsedSeconds: elapsed, usage,
      analyzer: provenance?.analyzer ?? { provider: "typesafe.ai", model: "sample-fixture", definitionVersion: 1, definitionHash: null, appVersion: packageInfo.version, gitCommit: null },
    } };
  }, [video, items, sample, provenance, analysisComplete, scope, total, failures, elapsed, usage]);
  const groups = useMemo(() => groupItems(visible), [visible]);
  useEffect(() => {
    if (selectedGroup && !groups.some(group => group.key === selectedGroup && group.count > 0 && groupInRange(group, filters))) setSelectedGroup(null);
    if (selectedId && !visible.some(item => item.id === selectedId)) setSelectedId(null);
  }, [filters, groups, visible, selectedGroup, selectedId]);

  function resetView() {
    setAnalysisGeneration(current => current + 1);
    setFilters(defaultFilters()); setTab("comments"); setSelectedId(null); setSelectedGroup(null); setReturnState(null); setMapOpen(true);
  }
  async function loadSample() {
    if (busy.current) return;
    busy.current = true; setChecking(true);
    try {
      const { sampleItems, sampleVideo } = await import("@/lib/sample-data");
      setProvenance(null); setAnalysisComplete(true); setAutoSaveToken(null); setLoadedSavedAt(null); setElapsed(0); setUsage(emptyUsage); setSpeed(0);
      setItems(sampleItems); setVideo(sampleVideo); setSample(true); setStatus(""); setError(""); setTotal(sampleItems.length); setProcessed(sampleItems.length); setFailures(0); setScope("first100"); setChangeOpen(false); resetView();
    } catch { setError("サンプルを読み込めませんでした。もう一度お試しください。"); }
    finally { busy.current = false; setChecking(false); }
  }
  async function inspect() {
    if (busy.current) return;
    busy.current = true; setChecking(true); setError("");
    try {
      const response = await fetch("/api/comments?url=" + encodeURIComponent(url));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "動画を読み込めませんでした。");
      setProvenance(null); setAnalysisComplete(false); setAutoSaveToken(null); setLoadedSavedAt(null);
      setVideo(data); setItems([]); setSample(false); setProcessed(0); setTotal(0); setStatus(""); setFailures(0); resetView(); setChangeOpen(false);
      if (data.count > 100) setConfirmOpen(true);
      else await start(data, "first100");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "URLを確認してください。"); }
    finally { busy.current = false; setChecking(false); }
  }
  async function start(info = video, selectedScope: "first100" | "all" = "first100") {
    if (!info || running) return;
    setProvenance(null); setAnalysisComplete(false); setAutoSaveToken(null); setLoadedSavedAt(null);
    busy.current = true; setConfirmOpen(false); setError(""); setItems([]); setProcessed(0); setTotal(0); setSpeed(0); setFailures(0); setElapsed(0); setUsage(emptyUsage); setMonitorExpanded(true); setScope(selectedScope); setStatus("YouTubeからコメントを取得中…"); setRunning(true); setSample(false); resetView();
    const timer = window.setInterval(() => setElapsed(n => n + 1), 1000);
    abort.current = new AbortController();
    let completed = false;
    try {
      const response = await fetch("/api/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${info.id}`, scope: selectedScope }), signal: abort.current.signal });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "分類を開始できませんでした。");
      }
      await readJsonLines<StreamEvent>(response.body, event => {
        if (event.analyzer && event.startedAt) setProvenance({ startedAt: event.startedAt, completedAt: null, analyzer: event.analyzer });
        if (event.completedAt) setProvenance(current => current ? { ...current, completedAt: event.completedAt! } : current);
        if (event.type === "status") setStatus(event.message ?? "処理中");
        if (event.type === "start") { setTotal(event.total ?? 0); setStatus("Jevがコメントを分析中"); }
        if (event.type === "item" || event.type === "item_error" || event.type === "complete") {
          if (event.item) setItems(current => [...current, event.item!]);
          setProcessed(event.processed ?? 0); setTotal(event.total ?? 0);
          if (event.speed !== undefined) setSpeed(event.speed);
          if (event.usage) setUsage(event.usage);
          if (event.type === "item_error") setFailures(n => n + 1);
          if (event.type === "complete") { completed = true; setAnalysisComplete(true); setAutoSaveToken(crypto.randomUUID()); setFailures(event.failures ?? 0); setElapsed(Math.round((event.elapsedMs ?? 0) / 1000)); setStatus("分析が完了しました"); }
        }
        if (event.type === "error") throw new Error(event.message ?? "処理に失敗しました。");
      });
      if (!completed) throw new Error("分析完了前に接続が切れました。取得済みの結果は表示しています。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通信に失敗しました。"); setStatus("処理が中断しました"); }
    finally { clearInterval(timer); setRunning(false); busy.current = false; setMonitorExpanded(false); }
  }
  function loadArchive(archive: AnalysisArchive) {
    if (busy.current) return;
    const analysis = archive.analysis;
    setItems(archive.items); setVideo(archive.video); setSample(analysis.source === "sample");
    setProvenance({ startedAt: analysis.startedAt, completedAt: analysis.completedAt, analyzer: analysis.analyzer });
    setAnalysisComplete(analysis.status === "complete"); setAutoSaveToken(null); setLoadedSavedAt(archive.savedAt);
    setScope(analysis.scope); setProcessed(analysis.processed); setTotal(analysis.total); setFailures(analysis.failures);
    setElapsed(analysis.elapsedSeconds); setUsage(analysis.usage); setSpeed(analysis.elapsedSeconds > 0 ? analysis.processed / analysis.elapsedSeconds : 0);
    setError(""); setStatus(analysis.status === "complete" ? "保存した分析結果を表示しています" : "保存した途中結果を表示しています");
    setMonitorExpanded(false); setChangeOpen(false); setConfirmOpen(false); resetView();
  }
  function showGroupComments(group: Group) {
    setReturnState({ filters: { ...filters, genders: [...filters.genders], ageRange: [...filters.ageRange], heatRange: [...filters.heatRange] }, view, selectedKey: group.key });
    const index = ages.indexOf(group.age as typeof ages[number]);
    setFilters({ ...filters, genders: [group.gender], ageRange: [index, index] }); setTab("comments"); setSelectedId(null);
  }
  function restoreComparison() {
    if (!returnState) return;
    setFilters(returnState.filters); setView(returnState.view); setSelectedGroup(returnState.selectedKey); setTab("demographics"); setReturnState(null);
  }
  const sortOptions = [
    { value: "likes", label: "いいね数" }, { value: "newest", label: "投稿日時" }, { value: "valence", label: "感情の平均値" }, { value: "heat", label: "熱量の平均値" }, { value: "bothSides", label: "好意と批判の混在確率" },
    ...valenceStages.map(stage => ({ value: `valence:${stage.level}`, label: `確率：${stage.label}` })),
    ...heatStages.map(stage => ({ value: `heat:${stage.level}`, label: `確率：${stage.label}` })),
    ...genders.map(gender => ({ value: `gender:${gender}`, label: `確率：${genderLabels[gender]}` })),
    ...ages.map(age => ({ value: `age:${age}`, label: `確率：${ageLabels[age]}` })),
  ];
  const urlForm = <Box component="form" onSubmit={event => { event.preventDefault(); void inspect(); }} sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 2 }}>
    <TextField label="YouTube動画のURL" placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={event => setUrl(event.target.value)} required disabled={checking || running} sx={{ flex: 1, minWidth: { xs: "100%", sm: 340 } }} />
    <Button variant="contained" type="submit" disabled={!url.trim() || checking || running} startIcon={checking ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}>コメントを分析</Button>
  </Box>;

  return <Box component="main" className="analysis-shell">
    {!video ? <Box sx={{ maxWidth: 840, mx: "auto", pt: { xs: 6, md: 12 } }}>
      <Stack sx={{ alignItems: "center", gap: 1.5 }} direction="row"><YouTubeIcon sx={{ color: "#FF0000", fontSize: 36 }} /><Typography component="h1" variant="h1">YouTubeコメント分析</Typography></Stack>
      <Typography color="text.secondary" sx={{ mt: 2, lineHeight: 1.9 }}>コメントの原文を読みながら、感情の向き・熱量・文体の印象を比較できます。</Typography>
      {urlForm}
      <Button onClick={() => void loadSample()} disabled={checking || running} sx={{ mt: 2 }}>サンプルデータで試す</Button>
      <Divider sx={{ my: 4 }} />
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.9 }}>公開コメントの先頭コメントを取得します。返信は分析対象に含みません。<br />文体印象は本人の年齢・性別ではありません。分析結果は参考表示です。</Typography>
    </Box> : <header className="video-header">
        <Stack direction="row" sx={{gap: 2, alignItems: "center",  minWidth: 0 }}>
          {video.thumbnail && <Box component="img" src={video.thumbnail} alt="動画のサムネイル" sx={{ width: 110, height: 62, objectFit: "cover", borderRadius: 1, display: { xs: "none", sm: "block" } }} />}
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontSize: { xs: 18, sm: 20 }, fontWeight: 700, lineHeight: 1.5, overflowWrap: "anywhere" }}>{video.title}</Typography>
            <Stack sx={{ gap: 1.5, alignItems: "center", flexWrap: "wrap", mt: .5 }} direction="row">
              <Stack sx={{ gap: .7, alignItems: "center" }} direction="row"><YouTubeIcon sx={{ color: "#FF0000", fontSize: 24 }} /><Typography variant="body2">{video.channel}</Typography></Stack>
              <Button size="small" color="inherit" sx={{ bgcolor: "#F2F2F2" }} disabled={running || checking} onClick={() => { setError(""); setChangeOpen(true); }}>動画を変更</Button>
              {sample && <Chip label="架空サンプル（集計から再構成）" size="small" />}
              {loadedSavedAt && <Chip label="保存データ" size="small" variant="outlined" />}
            </Stack>
          </Box>
        </Stack>
        <Box sx={{ textAlign: { md: "right" }, flexShrink: 0 }}>
          <Typography variant="body2">分析済み {items.length}件 ／ 動画全体 約{video.count.toLocaleString()}件</Typography>
          <Typography variant="caption" color="text.secondary">取得：関連度順・{scope === "all" ? "全件" : "先頭100件まで"}・返信を除く</Typography>
          {loadedSavedAt && <Typography variant="caption" component="div" color="text.secondary">保存：{new Date(loadedSavedAt).toLocaleString("ja-JP")} · 投稿者画像は省略</Typography>}
        </Box>
      </header>}
    <Box sx={{ maxWidth: video ? "none" : 840, mx: "auto", mb: 1 }}>
      <AnalysisLibrary snapshot={snapshot} disabled={running || checking} onLoad={loadArchive} autoSaveToken={!running && !checking ? autoSaveToken : null} />
    </Box>
    {video && <>
      {!sample && status && <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5, mb: 1 }}>
        <Stack sx={{ alignItems: "center", gap: 2, flexWrap: "wrap" }} direction="row">
          <Typography sx={{ fontSize: 13 }} role="status">{status} · {processed} / {total}件</Typography>
          <Typography variant="caption" color="text.secondary">経過 {formatTime(elapsed)} · 平均 {speed.toFixed(1)}件/秒{running && speed > 0 ? ` · 残り約${Math.ceil((total - processed) / speed)}秒` : ""}</Typography>
          <Button size="small" endIcon={<ExpandMoreIcon />} onClick={() => setMonitorExpanded(!monitorExpanded)} aria-expanded={monitorExpanded}>処理の詳細</Button>
        </Stack>
        {running && <LinearProgress variant={total ? "determinate" : "indeterminate"} value={total ? processed / total * 100 : 0} sx={{ mt: 1 }} />}
        <Collapse in={monitorExpanded}><Typography sx={{ display: "block", mt: 1 }} variant="caption">成功 {items.length}件 · 失敗 {failures}件 · 入力 {usage.inputTokens.toLocaleString()} tokens · 出力 {usage.outputTokens.toLocaleString()} tokens · 推定費用 ${usage.estimatedCostUsd.toFixed(6)}</Typography></Collapse>
      </Box>}
      {failures > 0 && <Alert severity="warning" sx={{ mb: 1 }}>分類に失敗した{failures}件を除き、成功した{items.length}件を集計しています。</Alert>}
      {!sample && !running && items.length === 0 && !status && <Button variant="contained" onClick={() => video.count > 100 ? setConfirmOpen(true) : void start(video, "first100")}>分析範囲を選ぶ</Button>}
      <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="分析の表示" sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Tab value="comments" label="コメント" id="comments-tab" aria-controls="comments-panel" />
        <Tab value="demographics" label="性別・年代別" id="demographics-tab" aria-controls="demographics-panel" />
        <Tab value="timestamps" label="時間帯別" id="timestamps-tab" aria-controls="timestamps-panel" />
      </Tabs>
      <CommonFilters filters={filters} onChange={setFilters} count={visible.length} total={items.length} expanded={filtersExpanded} onToggle={() => setFiltersExpanded(!filtersExpanded)} />
      <Typography variant="caption" color="text.secondary" sx={{display: "block",  mt: 1 }}>文体印象は本人の年齢・性別ではありません。集計は投稿者数ではなく、コメント単位です。</Typography>
      {(tab === "comments" || tab === "timestamps") && <div className="analysis-toolbar">
        <CommentFilters filters={filters} onChange={setFilters} />
        {tab === "comments" && <>
        <FormControl size="small" sx={{ minWidth: 170 }}><InputLabel id="sort-label">並び順</InputLabel><Select labelId="sort-label" label="並び順" value={sortKey} onChange={event => setSortKey(event.target.value)}>{sortOptions.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl>
        <Button color="inherit" startIcon={<SwapVertIcon />} onClick={() => setSortDirection(sortDirection === "desc" ? "asc" : "desc")}>{sortKey === "newest" ? (sortDirection === "desc" ? "新しい順" : "古い順") : sortDirection === "desc" ? "多い順" : "少ない順"}</Button>
        </>}
      </div>}
      {returnState && <Button startIcon={<ArrowBackIcon />} onClick={restoreComparison} sx={{ mb: 1 }}>元の比較条件に戻る</Button>}
      {visible.length === 0 && <Alert severity="info" sx={{ mb: 2 }} action={filters.genders.length === 0 ? <Button onClick={() => setFilters({ ...filters, genders: [...genders] })}>全選択</Button> : undefined}>条件に合うコメントはありません。性別・年代、検索、感情・熱量の条件を確認してください。</Alert>}
      {tab === "comments" && <Box role="tabpanel" id="comments-panel" aria-labelledby="comments-tab">
        <CommentOverview items={sorted} selectedId={selectedId} onSelect={setSelectedId} expanded={mapOpen} onToggle={() => setMapOpen(!mapOpen)} likeScaleMaximum={likeScaleMaximum} onShowMixed={() => { setSelectedId(null); setFilters({ ...filters, tone: "both" }); }} mixedOnly={filters.tone === "both"} />
        <CommentsView items={sorted} selectedId={selectedId} onSelect={setSelectedId} />
        <Button onClick={() => setTab("demographics")} sx={{ mt: 1 }}>この条件で性別・年代別を見る →</Button>
      </Box>}
      {tab === "demographics" && <Box role="tabpanel" id="demographics-panel" aria-labelledby="demographics-tab"><Demographics items={visible} filters={filters} view={view} onViewChange={setView} selectedKey={selectedGroup} onSelect={setSelectedGroup} onShowComments={showGroupComments} /></Box>}
      <Box role="tabpanel" id="timestamps-panel" aria-labelledby="timestamps-tab" hidden={tab !== "timestamps"}>
        <TimestampAnalysis key={analysisGeneration} video={video} items={visible} allItems={items} active={tab === "timestamps"} onDuration={updateDuration} />
      </Box>
    </>}
    {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>{error}</Alert>}
    <Dialog open={changeOpen} onClose={() => !checking && setChangeOpen(false)} fullWidth maxWidth="sm"><DialogTitle>分析する動画を変更</DialogTitle><DialogContent>{urlForm}{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setChangeOpen(false)} disabled={checking}>キャンセル</Button></DialogActions></Dialog>
    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm"><DialogTitle>コメントの分析範囲</DialogTitle><DialogContent><DialogContentText>動画全体には約{video?.count.toLocaleString()}件のコメントがあります。関連度順の先頭100件、または全件の先頭コメントを取得して分析できます。返信は含みません。全件では処理時間とJev利用料が増えます。</DialogContentText></DialogContent><DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, pb: 2 }}><Button onClick={() => setConfirmOpen(false)}>キャンセル</Button><Button variant="outlined" onClick={() => void start(video, "first100")}>関連度順の先頭100件</Button><Button variant="contained" onClick={() => void start(video, "all")}>全件を分析</Button></DialogActions></Dialog>
  </Box>;
}
