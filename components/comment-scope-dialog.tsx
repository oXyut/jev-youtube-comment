"use client";

import { useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, InputAdornment, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { commentLimit, isPositiveInteger, type CommentScope } from "@/lib/comment-scope";

type Props = { count: number; onClose: () => void; onStart: (selection: CommentScope) => void };

export function CommentScopeDialog({ count, onClose, onStart }: Props) {
  const [mode, setMode] = useState<"count" | "percentage" | "all">("count");
  const [countInput, setCountInput] = useState(String(Math.min(100, count || 100)));
  const [percentageInput, setPercentageInput] = useState("10");
  const limit = Number(countInput);
  const percentage = Number(percentageInput);
  const validCount = /^\d+$/.test(countInput) && isPositiveInteger(limit);
  const validPercentage = /^\d+$/.test(percentageInput) && isPositiveInteger(percentage) && percentage <= 100 && count > 0;
  const selection: CommentScope | null = mode === "all" ? { scope: "all" }
    : mode === "count" ? validCount ? { scope: "count", limit } : null
    : validPercentage ? { scope: "percentage", percentage, basisCount: count } : null;
  const target = selection ? commentLimit(selection) : undefined;
  const quickCount = Math.min(100, count || 100);
  const presets = [
    { label: `まず${quickCount}件`, hint: "少量で試す", active: mode === "count" && limit === quickCount, choose: () => { setMode("count"); setCountInput(String(quickCount)); } },
    { label: "10%", hint: "手早く確認", active: mode === "percentage" && percentage === 10, choose: () => { setMode("percentage"); setPercentageInput("10"); }, disabled: count === 0 },
    { label: "25%", hint: "対象を広げる", active: mode === "percentage" && percentage === 25, choose: () => { setMode("percentage"); setPercentageInput("25"); }, disabled: count === 0 },
    { label: "全件", hint: "すべて確認", active: mode === "all", choose: () => setMode("all") },
  ];

  return <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="comment-scope-title" aria-describedby="comment-scope-description"
    slotProps={{ paper: { sx: { m: { xs: 2, sm: 4 }, width: { xs: "calc(100% - 32px)", sm: "calc(100% - 64px)" } } } }}>
    <DialogTitle id="comment-scope-title">分析するコメント数を選ぶ</DialogTitle>
    <DialogContent>
      <DialogContentText id="comment-scope-description">動画全体のコメント数は約{count.toLocaleString()}件です。少量から試したり、動画の規模に合わせて割合で選べます。</DialogContentText>
      <Box role="group" aria-label="件数のクイック選択" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: 1, my: 2.5 }}>
        {presets.map(preset => <Button key={preset.label} variant="outlined" aria-pressed={preset.active} disabled={preset.disabled} onClick={preset.choose}
          sx={{ py: 1.5, px: 1, borderRadius: 2, flexDirection: "column", borderColor: preset.active ? "primary.main" : "divider", bgcolor: preset.active ? "#EEF5FF" : "background.paper", color: "text.primary" }}>
          <Typography component="span" sx={{ fontWeight: 700 }}>{preset.label}</Typography>
          <Typography component="span" variant="caption" color="text.secondary">{preset.hint}</Typography>
        </Button>)}
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>自分で調整</Typography>
      <ToggleButtonGroup exclusive value={mode} onChange={(_, value) => { if (value) setMode(value); }} size="small" fullWidth aria-label="分析範囲の指定方法" sx={{ mb: 2 }}>
        <ToggleButton value="count">件数</ToggleButton><ToggleButton value="percentage" disabled={count === 0}>割合</ToggleButton><ToggleButton value="all">全件</ToggleButton>
      </ToggleButtonGroup>
      {mode === "count" && <TextField fullWidth label="取得する件数の上限" value={countInput} onChange={event => setCountInput(event.target.value)} error={!validCount}
        helperText={validCount ? "1件から自由に指定できます。" : "1以上の整数を入力してください。"}
        slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" }, input: { endAdornment: <InputAdornment position="end">件</InputAdornment> } }} />}
      {mode === "percentage" && <>
        <TextField fullWidth label="動画全体に対する割合" value={percentageInput} onChange={event => setPercentageInput(event.target.value)} error={!validPercentage}
          helperText={validPercentage ? "表示中の動画全体件数から計算し、1件未満は切り上げます。" : "1〜100の整数を入力してください。"}
          slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" }, input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} />
        <Box sx={{ px: 1.5, pt: 1 }}><Slider aria-label="取得する割合" min={1} max={100} step={1} value={validPercentage ? percentage : 10}
          onChange={(_, value) => setPercentageInput(String(value))} valueLabelDisplay="auto" valueLabelFormat={value => `${value}%`} getAriaValueText={value => `${value}%`}
          marks={[{ value: 1, label: "1%" }, { value: 50, label: "50%" }, { value: 100, label: "100%" }]} /></Box>
      </>}
      <Box role="status" aria-live="polite" sx={{ p: 2, mt: 2, bgcolor: "#F6F8FA", borderRadius: 2 }}>
        <Stack direction="row" sx={{ alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="body2">取得・分析の上限</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, overflowWrap: "anywhere" }}>{!selection ? "—" : mode === "all" ? "全件" : `${target!.toLocaleString()}件`}</Typography>
          {mode === "all" && <Typography variant="caption" color="text.secondary">公開されている先頭コメントすべて</Typography>}
        </Stack>
        {selection && mode !== "all" && count > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>
          {mode === "percentage" ? `動画全体の${percentage}%を目安に取得` : target! > count ? "指定件数が動画全体件数を超えています。取得できた分を分析します。" : `動画全体の約${(target! / count * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`}
        </Typography>}
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>件数が多いほど処理時間とJev利用料が増えます。</Typography>
      </Box>
      <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 2, lineHeight: 1.8 }}>
        関連度順の先頭から取得します。割合指定もランダム抽出ではありません。動画全体の件数と返信を除いた取得可能件数は異なるため、実際の取得数は上限より少なくなる場合があります。
      </Typography>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: "wrap" }}>
      <Button onClick={onClose}>キャンセル</Button>
      <Button variant="contained" disabled={!selection} onClick={() => { if (selection) onStart(selection); }}>{mode === "all" ? "全件を分析" : selection ? `最大${target!.toLocaleString()}件を分析` : "分析を開始"}</Button>
    </DialogActions>
  </Dialog>;
}
