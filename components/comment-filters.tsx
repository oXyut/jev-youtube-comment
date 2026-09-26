"use client";

import { Button, FormControl, InputAdornment, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { defaultFilters, toneLabels, type Filters, type Tone } from "@/lib/analysis";

/** The text, tone and heat controls share the same state in both comment views. */
export function CommentFilters({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  return <>
    <TextField label="コメントを検索" value={filters.search} onChange={event => onChange({ ...filters, search: event.target.value })} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} sx={{ width: { xs: "100%", sm: 280 } }} />
    <FormControl size="small" sx={{ minWidth: 155 }}><InputLabel id="tone-label">感情</InputLabel><Select labelId="tone-label" label="感情" value={filters.tone} onChange={event => onChange({ ...filters, tone: event.target.value as Filters["tone"] })}><MenuItem value="all">すべて</MenuItem>{(["critical", "center", "positive"] as Tone[]).map(tone => <MenuItem key={tone} value={tone}>{toneLabels[tone]}</MenuItem>)}<MenuItem value="both">好意・批判の両方を含む推定</MenuItem></Select></FormControl>
    <Stack sx={{ alignItems: "center", gap: .8 }} direction="row">
      <TextField select label="熱量の下限" value={filters.heatRange[0]} onChange={event => onChange({ ...filters, heatRange: [Number(event.target.value), filters.heatRange[1]] })} sx={{ width: 115 }}>{[0, 1, 2, 3, 4].map(value => <MenuItem key={value} value={value} disabled={value > filters.heatRange[1]}>{value}</MenuItem>)}</TextField>
      <Typography color="text.secondary">〜</Typography>
      <TextField select label="熱量の上限" value={filters.heatRange[1]} onChange={event => onChange({ ...filters, heatRange: [filters.heatRange[0], Number(event.target.value)] })} sx={{ width: 115 }}>{[0, 1, 2, 3, 4].map(value => <MenuItem key={value} value={value} disabled={value < filters.heatRange[0]}>{value}</MenuItem>)}</TextField>
    </Stack>
    <Button size="small" onClick={() => onChange(defaultFilters())}>すべての条件を解除</Button>
  </>;
}
