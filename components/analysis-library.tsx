"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Radio,
  Stack,
  Typography,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { formatCommentScope } from "@/lib/comment-scope";
import {
  parseAnalysisArchive,
  type AnalysisArchive,
  type AnalysisArchiveSummary,
  type AnalysisSaveInput,
} from "@/lib/analysis-archive";

export type AnalysisLibraryProps = {
  snapshot: AnalysisSaveInput | null;
  disabled: boolean;
  onLoad: (archive: AnalysisArchive) => void;
  /** A unique token for one completed live analysis, never for samples or loads. */
  autoSaveToken?: string | null;
};

type Operation = "save" | "list" | "load" | "export" | "import" | null;
type Feedback = { severity: "success" | "error" | "info"; text: string } | null;

const savedDate = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "処理を完了できませんでした。もう一度お試しください。";

async function readResponse(response: Response): Promise<unknown> {
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new Error("保存データの応答を読み取れませんでした。もう一度お試しください。"); }
  if (!response.ok) {
    const message = value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "保存データを処理できませんでした。";
    throw new Error(message);
  }
  return value;
}

function summaryOf(archive: AnalysisArchive): AnalysisArchiveSummary {
  return { id: archive.id, savedAt: archive.savedAt, video: archive.video, itemCount: archive.items.length, analysis: archive.analysis };
}

export function AnalysisLibrary({ snapshot, disabled, onLoad, autoSaveToken = null }: AnalysisLibraryProps) {
  const [open, setOpen] = useState(false);
  const [operation, setOperation] = useState<Operation>(null);
  const [summaries, setSummaries] = useState<AnalysisArchiveSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [dialogError, setDialogError] = useState("");
  const [listWarning, setListWarning] = useState("");
  const [listLoaded, setListLoaded] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const attemptedTokens = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  const activeArchive = useRef<AnalysisArchive | null>(null);
  const liveProps = useRef({ disabled, onLoad, open });
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const readControllers = useRef(new Set<AbortController>());

  useEffect(() => { liveProps.current = { disabled, onLoad, open }; }, [disabled, onLoad, open]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const controller of readControllers.current) controller.abort();
      for (const [url, timeout] of downloads.current) { clearTimeout(timeout); URL.revokeObjectURL(url); }
      downloads.current.clear();
    };
  }, []);

  const begin = useCallback((next: Exclude<Operation, null>) => {
    if (lock.current) return false;
    lock.current = true;
    setOperation(next);
    setDialogError("");
    return true;
  }, []);
  const finish = useCallback(() => {
    lock.current = false;
    if (mounted.current) setOperation(null);
  }, []);

  const getArchive = useCallback(async (id: string) => {
    const controller = new AbortController();
    readControllers.current.add(controller);
    try {
      return parseAnalysisArchive(await readResponse(await fetch(`/api/analyses/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })));
    } finally { readControllers.current.delete(controller); }
  }, []);

  const saveSnapshot = useCallback(async (input: AnalysisSaveInput, automatic = false) => {
    if (liveProps.current.disabled || !begin("save")) return;
    setFeedback({ severity: "info", text: automatic ? "分析結果を自動保存中…" : "分析結果を保存中…" });
    try {
      // A POST is allowed to finish on unmount; aborting could hide a completed save.
      const archive = parseAnalysisArchive(await readResponse(await fetch("/api/analyses", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      })));
      if (!mounted.current) return;
      activeArchive.current = archive;
      setSelectedId(archive.id);
      setSummaries(previous => [summaryOf(archive), ...previous.filter(entry => entry.id !== archive.id)]);
      setFeedback({ severity: "success", text: `${archive.items.length}件の分析結果を${automatic ? "自動" : ""}保存しました。` });
    } catch (cause) {
      if (!mounted.current) return;
      const message = `${automatic ? "自動保存できませんでした。" : "保存できませんでした。"}${errorText(cause)}「保存」から再試行できます。`;
      setFeedback({ severity: "error", text: message });
      if (liveProps.current.open) setDialogError(message);
    } finally { finish(); }
  }, [begin, finish]);

  useEffect(() => {
    if (!autoSaveToken || !snapshot || disabled || operation || lock.current || attemptedTokens.current.has(autoSaveToken)) return;
    attemptedTokens.current.add(autoSaveToken);
    void saveSnapshot(snapshot, true);
  }, [autoSaveToken, disabled, operation, saveSnapshot, snapshot]);

  async function refreshHistory() {
    if (!begin("list")) return;
    setListWarning("");
    const controller = new AbortController();
    readControllers.current.add(controller);
    try {
      const value = await readResponse(await fetch("/api/analyses", { cache: "no-store", signal: controller.signal }));
      if (!value || typeof value !== "object" || !("analyses" in value) || !Array.isArray(value.analyses)) throw new Error("保存履歴の形式が正しくありません。");
      if (!mounted.current) return;
      const list = value.analyses as AnalysisArchiveSummary[];
      setSummaries(list);
      setSelectedId(previous => list.some(entry => entry.id === previous) ? previous : list[0]?.id ?? null);
      setListLoaded(true);
      if ("skippedCount" in value && typeof value.skippedCount === "number" && value.skippedCount > 0) setListWarning(`読み取れない保存データ${value.skippedCount}件を一覧から除外しました。ほかの保存データは利用できます。`);
    } catch (cause) {
      if (mounted.current) setDialogError(errorText(cause));
    } finally { readControllers.current.delete(controller); finish(); }
  }

  function openHistory() {
    if (lock.current || disabled) return;
    setOpen(true);
    setDialogError("");
    void refreshHistory();
  }

  async function loadSelected() {
    if (!selectedId || disabled || !begin("load")) return;
    try {
      const archive = await getArchive(selectedId);
      if (!mounted.current) return;
      if (liveProps.current.disabled) throw new Error("分析処理中は保存データを開けません。処理が終わってからもう一度お試しください。");
      activeArchive.current = archive;
      liveProps.current.onLoad(archive);
      setFeedback({ severity: "success", text: `${archive.items.length}件の保存データを開きました。` });
      setOpen(false);
    } catch (cause) {
      if (mounted.current) setDialogError(errorText(cause));
    } finally { finish(); }
  }

  function downloadArchive(archive: AnalysisArchive) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    const title = archive.video.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 65) || "analysis";
    link.href = url;
    link.download = `${title}_${archive.savedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Keep the URL alive while the browser starts the download, then release it.
    const timeout = setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 60_000);
    downloads.current.set(url, timeout);
  }

  async function exportSelected() {
    if (disabled || !begin("export")) return;
    try {
      const archive = selectedId ? await getArchive(selectedId) : activeArchive.current;
      if (!mounted.current) return;
      if (!archive) throw new Error("書き出す保存データを選択してください。");
      downloadArchive(archive);
    } catch (cause) {
      if (mounted.current) setDialogError(errorText(cause));
    } finally { finish(); }
  }

  async function importFile(file: File) {
    if (disabled || !begin("import")) return;
    try {
      let value: unknown;
      try { value = JSON.parse(await file.text()); }
      catch { throw new Error("JSONファイルを読み取れませんでした。書き出した分析データを選択してください。"); }
      const archive = parseAnalysisArchive(value);
      if (!mounted.current) return;
      if (liveProps.current.disabled) throw new Error("分析処理中は保存データを読み込めません。処理が終わってからもう一度お試しください。");
      activeArchive.current = archive;
      setSelectedId(null);
      liveProps.current.onLoad(archive);
      setFeedback({ severity: "success", text: `${archive.items.length}件をJSONから読み込みました。この端末にも残す場合は「保存」を押してください。` });
      setOpen(false);
    } catch (cause) {
      if (mounted.current) setDialogError(errorText(cause));
    } finally { finish(); }
  }

  const busy = operation !== null;
  const blocked = disabled || busy;
  return <Box sx={{ minWidth: 0 }}>
    <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Button size="small" startIcon={operation === "save" ? <CircularProgress size={15} /> : <SaveOutlinedIcon />} disabled={blocked || !snapshot?.items.length} onClick={() => snapshot && void saveSnapshot(snapshot)}>保存</Button>
      <Button size="small" startIcon={<FolderOpenOutlinedIcon />} disabled={blocked} onClick={openHistory}>保存データを開く</Button>
      {feedback && feedback.severity !== "error" && <Typography role="status" variant="caption" color="text.secondary">{feedback.text}</Typography>}
    </Stack>
    {feedback?.severity === "error" && <Alert severity="error" sx={{ mt: 1, py: 0 }}>{feedback.text}</Alert>}
    <Dialog open={open} fullWidth maxWidth="sm" onClose={() => { if (!lock.current) setOpen(false); }} aria-labelledby="analysis-library-title">
      <DialogTitle id="analysis-library-title" sx={{ pb: 1 }}>保存した分析データ</DialogTitle>
      {busy && <LinearProgress aria-label={operation === "save" ? "分析データを保存中" : "保存データを処理中"} />}
      <DialogContent sx={{ pt: "12px !important" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>保存済みの判定結果を開きます。コメントの再取得・再分析は行いません。</Typography>
        {dialogError && <Alert severity="error" sx={{ mb: 1.5 }}>{dialogError}</Alert>}
        {listWarning && <Alert severity="warning" sx={{ mb: 1.5 }}>{listWarning}</Alert>}
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="subtitle2">保存履歴 {listLoaded ? `(${summaries.length}件)` : ""}</Typography>
          <IconButton size="small" aria-label="保存履歴を更新" disabled={blocked} onClick={() => void refreshHistory()}><RefreshRoundedIcon fontSize="small" /></IconButton>
        </Stack>
        <List component="div" role="group" disablePadding sx={{ maxHeight: 350, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }} aria-label="保存した分析の一覧">
          {summaries.map(entry => <ListItemButton key={entry.id} selected={selectedId === entry.id} aria-pressed={selectedId === entry.id} disabled={blocked} onClick={() => setSelectedId(entry.id)} sx={{ alignItems: "flex-start", borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } }}>
            <Radio checked={selectedId === entry.id} size="small" tabIndex={-1} disableRipple slotProps={{ input: { "aria-label": `${entry.video.title}を選択` } }} sx={{ ml: -1, mr: 0.5, mt: 0.5, pointerEvents: "none" }} />
            <ListItemText disableTypography primary={<Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{entry.video.title}</Typography>} secondary={<Box sx={{ mt: 0.6 }}>
              <Typography variant="caption" color="text.secondary">{savedDate(entry.savedAt)} 保存・{entry.itemCount}件</Typography>
              <Typography variant="caption" component="div" color="text.secondary">取得範囲：{formatCommentScope(entry.analysis)}</Typography>
              <Stack direction="row" sx={{ gap: 0.6, mt: 0.7, flexWrap: "wrap" }}>
                <Chip size="small" label={entry.analysis.source === "sample" ? "サンプル" : "Jevで分析"} sx={{ height: 21, fontSize: 11, bgcolor: entry.analysis.source === "sample" ? "#f0f1f3" : "#e8f0fa", color: entry.analysis.source === "sample" ? "#606060" : "#426483" }} />
                <Chip size="small" label={entry.analysis.status === "partial" ? "部分保存" : "完了"} sx={{ height: 21, fontSize: 11, bgcolor: entry.analysis.status === "partial" ? "#fff2d7" : "#edf3ed", color: entry.analysis.status === "partial" ? "#815815" : "#476a4b" }} />
                <Typography variant="caption" color="text.secondary">処理{entry.analysis.processed} / {entry.analysis.total}件{entry.analysis.failures > 0 ? `・判定失敗${entry.analysis.failures}件` : ""}</Typography>
              </Stack>
            </Box>} />
          </ListItemButton>)}
          {!listLoaded && operation === "list" && <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>保存履歴を読み込み中…</Typography>}
          {listLoaded && !summaries.length && <Box sx={{ py: 5, px: 2, textAlign: "center" }}><Typography variant="body2" color="text.secondary">保存データはまだありません。</Typography><Typography variant="caption" color="text.secondary">分析後に「保存」を押すか、JSONを読み込んでください。</Typography></Box>}
        </List>
        <Stack direction="row" sx={{ gap: 1, mt: 2, flexWrap: "wrap" }}>
          <Button size="small" variant="outlined" startIcon={<FileUploadOutlinedIcon />} disabled={blocked} onClick={() => fileInput.current?.click()}>JSONを読み込む</Button>
          <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} disabled={blocked || (!selectedId && !activeArchive.current)} onClick={() => void exportSelected()}>JSONを書き出す</Button>
        </Stack>
        {!selectedId && activeArchive.current && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>書き出し対象：読み込み済みの「{activeArchive.current.video.title}」</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>JSONにはコメント本文と分析結果が含まれます。</Typography>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden aria-label="分析データのJSONファイル" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 0.5 }}>
        <Button disabled={busy} onClick={() => setOpen(false)}>閉じる</Button>
        <Button variant="contained" startIcon={<FolderOpenOutlinedIcon />} disabled={blocked || !selectedId} onClick={() => void loadSelected()}>選択したデータを開く</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
