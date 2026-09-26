"use client";

import { Box, Button, Checkbox, Chip, Collapse, FormControlLabel, Slider, Stack, Typography } from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { ages, ageLabels, genders, genderLabels, genderColors, toneLabels, type Filters } from "@/lib/analysis";

export function CommonFilters({ filters, onChange, count, total, expanded, onToggle }: {
  filters: Filters; onChange: (filters: Filters) => void; count: number; total: number; expanded: boolean; onToggle: () => void;
}) {
  const range = filters.ageRange;
  const ageSummary = range[0] === range[1] ? ageLabels[ages[range[0]]] : `${ageLabels[ages[range[0]]]}〜${ageLabels[ages[range[1]]]}`;
  const genderSummary = filters.genders.length === 3 ? "性別文体：すべて" : filters.genders.length === 0 ? "性別文体：選択なし" : filters.genders.map(g => genderLabels[g]).join("・");
  return <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: { xs: 1.5, md: 2 }, mt: 2 }}>
    <Stack sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }} direction="row">
      <Typography sx={{ fontWeight: 700 }} aria-live="polite" data-testid="target-count">対象 {count}件／分析済み{total}件</Typography>
      <Chip size="small" label={genderSummary} sx={{ bgcolor: "#F2F5F9" }} />
      <Chip size="small" label={ageSummary} sx={{ bgcolor: "#EDF2E8", color: "#344B2D" }} />
      {filters.search && <Chip size="small" label={`検索：${filters.search}`} />}
      {filters.tone !== "all" && <Chip size="small" label={filters.tone === "both" ? "混在確率50%以上" : toneLabels[filters.tone]} />}
      {(filters.heatRange[0] !== 0 || filters.heatRange[1] !== 4) && <Chip size="small" label={`熱量：${filters.heatRange[0]}〜${filters.heatRange[1]}`} />}
      <Button size="small" startIcon={expanded ? <ExpandLessIcon /> : <TuneIcon />} aria-expanded={expanded} aria-controls="demographic-filter-editor" onClick={onToggle} sx={{ ml: { md: "auto" } }}>{expanded ? "条件を閉じる" : "性別・年代を絞り込む"}</Button>
    </Stack>
    <Collapse in={expanded} id="demographic-filter-editor">
      <div className="filter-editor">
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 1 }}>性別の文体印象（複数選択）</Typography>
          <Stack sx={{ gap: 1, flexWrap: "wrap" }} direction="row">
            {genders.map(gender => <FormControlLabel key={gender} sx={{ m: 0, pr: 1.3, borderRadius: 1, bgcolor: genderColors[gender].background, color: genderColors[gender].text, ".MuiFormControlLabel-label": { fontSize: 13 }, ".MuiCheckbox-root": { color: genderColors[gender].text, "&.Mui-checked": { color: genderColors[gender].text } } }} label={genderLabels[gender]} control={<Checkbox size="small" checked={filters.genders.includes(gender)} onChange={(_, checked) => onChange({ ...filters, genders: checked ? [...filters.genders, gender] : filters.genders.filter(g => g !== gender) })} />} />)}
          </Stack>
          <Stack sx={{ gap: 1, mt: 0.7, flexWrap: "wrap" }} direction="row">
            <Button size="small" onClick={() => onChange({ ...filters, genders: [...genders] })}>全選択</Button>
            <Button size="small" onClick={() => onChange({ ...filters, genders: [] })}>全解除</Button>
            <Button size="small" onClick={() => onChange({ ...filters, genders: [...genders], ageRange: [0, 4] })}>性別・年代をリセット</Button>
          </Stack>
        </Box>
        <Box>
          <Stack sx={{ justifyContent: "space-between", gap: 2 }} direction="row"><Typography sx={{ fontWeight: 600, fontSize: 13 }}>年代の文体印象</Typography><Typography sx={{ fontSize: 13 }}>{ageSummary}</Typography></Stack>
          <Box sx={{ mx: { xs: 3, sm: 4 }, mt: 1, mb: 1 }}><Slider min={0} max={4} step={1} disableSwap value={range} marks={ages.map((age, index) => ({ value: index, label: ageLabels[age] }))} getAriaLabel={index => index === 0 ? "年代の下限" : "年代の上限"} getAriaValueText={value => ageLabels[ages[value]]} onChange={(_, value) => onChange({ ...filters, ageRange: value as [number, number] })} sx={{ ".MuiSlider-markLabel": { fontSize: { xs: 10, sm: 12 } } }} /></Box>
        </Box>
      </div>
    </Collapse>
  </Box>;
}
