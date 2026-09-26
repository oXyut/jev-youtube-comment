"use client";

import { useMemo } from "react";
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import BubbleChartRoundedIcon from "@mui/icons-material/BubbleChartRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import {
  ages,
  ageColors,
  ageLabels,
  genders,
  genderColors,
  genderLabels,
  groupInRange,
  groupItems,
  toneColors,
  toneForScore,
  toneLabels,
  type Filters,
  type Group,
  type Item,
} from "@/lib/analysis";
import { meanSentimentColor, meanSentimentGradient, sentimentRingSegments } from "@/lib/sentiment-display";
import "./demographics.css";

export type DemographicsView = "comparison" | "map";

type Props = {
  /** The same filtered collection displayed in the comments tab. */
  items: Item[];
  filters: Filters;
  view: DemographicsView;
  onViewChange: (view: DemographicsView) => void;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onShowComments: (group: Group) => void;
};

const tones = ["critical", "center", "positive"] as const;
const mapGenders = ["masculine_coded", "ambiguous", "feminine_coded"] as const;
const signed = (value: number) => Math.abs(value) < .005 ? "0.00" : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
const percentage = (count: number, total: number) => total ? (count / total * 100).toFixed(1) : "0.0";

function Composition({ group, detailed = false }: { group: Group; detailed?: boolean }) {
  if (!group.count) {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 0.8 }}>対象コメントなし</Typography>;
  }
  const description = tones.map(tone => `${toneLabels[tone]} ${group.counts[tone]}件（${percentage(group.counts[tone], group.count)}%）`).join("、");
  return (
    <Box sx={{ minWidth: 0, width: "100%" }}>
      <Box className="demographics-composition" role="img" aria-label={`感情構成：${description}`}>
        {tones.map(tone => {
          const value = group.counts[tone] / group.count * 100;
          return value > 0 ? (
            <Box key={tone} sx={{ width: `${value}%`, backgroundColor: toneColors[tone], height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {!detailed && value >= 5 && <span aria-hidden="true">{Math.round(value)}%</span>}
            </Box>
          ) : null;
        })}
      </Box>
      {detailed && <Box className="demographics-composition-details">
        {tones.map(tone => <Box key={tone}>
          <Typography component="div" sx={{ fontSize: 18, fontWeight: 700, color: toneColors[tone] }}>{percentage(group.counts[tone], group.count)}%</Typography>
          <Typography variant="body2" sx={{ mt: 0.3 }}>{toneLabels[tone]} <strong>{group.counts[tone]}件</strong></Typography>
        </Box>)}
      </Box>}
    </Box>
  );
}

function SentimentLegend() {
  return <Stack direction="row"   sx={{gap: 2, flexWrap: "wrap",  my: 1 }}>
    {tones.map(tone => <Stack key={tone} direction="row"   sx={{ alignItems: "flex-start", gap: 0.8 }}>
      <Box aria-hidden="true" sx={{ width: 12, height: 12, flexShrink: 0, borderRadius: "50%", background: toneColors[tone], mt: 0.5 }} />
      <Box>
        <Typography variant="body2">{toneLabels[tone]}</Typography>
      </Box>
    </Stack>)}
  </Stack>;
}

function SentimentBubble({ count, counts, mean, size }: { count: number; counts: Group["counts"]; mean: number; size: number }) {
  return <Box className="demographics-bubble" sx={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <circle cx="50" cy="50" r="50" fill="#fff" />
      <circle className="demographics-bubble-mean" cx="50" cy="50" r="38" fill={meanSentimentColor(mean)} />
      {sentimentRingSegments(counts).map(segment => <circle key={segment.tone} data-tone={segment.tone}
        cx="50" cy="50" r="45.5" fill="none" stroke={toneColors[segment.tone]} strokeWidth="9" pathLength="100"
        strokeDasharray={`${segment.share} ${100 - segment.share}`} strokeDashoffset={-segment.offset} transform="rotate(-90 50 50)" />)}
    </svg>
    <span style={{ fontSize: Math.min(15, size / Math.max(1.8, String(count).length * 1.1)) }}>{count}</span>
  </Box>;
}

function MeanSentimentLegend() {
  return <Box className="demographics-mean-legend">
    <Typography variant="body2" sx={{ fontWeight: 600 }}>中央の色＝感情の向きの平均</Typography>
    <Box className="demographics-gradient" sx={{ background: meanSentimentGradient }} role="img" aria-label="平均−2の赤から、0の淡い灰色、+2の緑へ連続して変化" />
    <Box className="demographics-score-ticks"><span>−2</span><span>−1</span><span>0</span><span>+1</span><span>+2</span></Box>
    <Stack direction="row" sx={{ justifyContent: "space-between", mt: .6 }}><Typography variant="caption" color="text.secondary">批判寄り</Typography><Typography variant="caption" color="text.secondary">好意寄り</Typography></Stack>
  </Box>;
}

function GroupDetail({ group, total, onShowComments, compact = false }: { group: Group | undefined; total: number; onShowComments: (group: Group) => void; compact?: boolean }) {
  if (compact) return <Box className="demographics-detail demographics-detail-wide" role="region" aria-label="選択したグループ" aria-live="polite">
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
        {group ? `選択：${ageLabels[group.age]} × ${genderLabels[group.gender]}・${group.count}件` : "グループの詳細"}
      </Typography>
      {group && group.count > 0 ? <Stack direction="row" sx={{ gap: 2.5, flexWrap: "wrap", mt: 0.7 }}>
        <Typography variant="body2" color="text.secondary">感情の向きの平均 <Box component="span" sx={{ color: "text.primary", ml: 0.6, fontVariantNumeric: "tabular-nums" }}>{signed(group.meanValence)}</Box></Typography>
        <Typography variant="body2" color="text.secondary">平均熱量 <Box component="span" sx={{ color: "text.primary", ml: 0.6, fontVariantNumeric: "tabular-nums" }}>{group.meanHeat.toFixed(1)} / 4</Box></Typography>
      </Stack> : <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>{group ? "対象コメントなし" : "グラフの行を選択すると、件数と平均をここに表示します。"}</Typography>}
    </Box>
    {group && <Button variant="contained" disableElevation disabled={!group.count} endIcon={<ArrowForwardRoundedIcon />} onClick={() => onShowComments(group)} sx={{ flexShrink: 0, borderRadius: 1.5, py: 1.1, px: 3 }}>
      この{group.count}件をコメントで見る
    </Button>}
  </Box>;
  return <Box className="demographics-detail" role="region" aria-label="選択したグループ" aria-live="polite">
    <Typography component="h3" variant="subtitle1"  sx={{ fontWeight: 700 }}>{group ? "選択したグループ" : "グループの詳細"}</Typography>
    {!group ? <Box sx={{ py: { xs: 3, md: 9 } }}>
      <Typography color="text.secondary" variant="body2">グラフの行や円を選択すると、感情の内訳をここに表示します。</Typography>
      <Typography color="text.secondary" variant="caption" sx={{ display: "block", mt: 1 }}>選択しただけでは、絞り込み条件は変わりません。</Typography>
    </Box> : <>
      <Stack direction="row"    sx={{alignItems: "center", gap: 1, flexWrap: "wrap",  mt: 1.5 }}>
        <Chip label={ageLabels[group.age]} size="small" sx={{ color: "#344B2D", background: ageColors[group.age], fontWeight: 600 }} />
        <Chip label={genderLabels[group.gender]} size="small" sx={{ color: genderColors[group.gender].text, background: genderColors[group.gender].background, fontWeight: 600 }} />
        <Typography  sx={{fontWeight: 700,  ml: 0.5, fontSize: 22 }}>{group.count}件</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.3, mb: 2.5 }}>対象{total}件のうち <strong>{group.count}件</strong>（{percentage(group.count, total)}%）です。</Typography>
      <Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2"  sx={{fontWeight: 700,  mb: 1.2 }}>感情の構成（{group.count}件）</Typography>
          <Composition group={group} detailed />
        </Box>
        {group.count > 0 && <Box sx={{ minWidth: 0 }}>
          <Divider sx={{ my: 2.5 }} />
          <Typography variant="body2"  sx={{fontWeight: 700,  mb: 1.3 }}>感情の向きの平均</Typography>
          <Stack direction="row"   sx={{ alignItems: "flex-start", gap: 1.5 }}>
            <Box sx={{ flex: 1, minWidth: 0, pt: 0.6 }}>
              <Box className="demographics-score-track" role="img" aria-label={`感情の向きの平均 ${signed(group.meanValence)}。尺度 −2から+2。${toneLabels[toneForScore(group.meanValence)]}`}>
                <Box sx={{ position: "absolute", left: "37.5%", width: "25%", height: "100%", backgroundColor: "#dce0e3" }} />
                <Box sx={{ position: "absolute", left: `${group.meanValence < 0 ? 50 + group.meanValence * 25 : 50}%`, width: `${Math.abs(group.meanValence) * 25}%`, height: "100%", backgroundColor: meanSentimentColor(group.meanValence), border: "1px solid #60706c", boxSizing: "border-box" }} />
                <Box sx={{ position: "absolute", left: "50%", height: "100%", borderLeft: "1px solid #87919A" }} />
              </Box>
              <Box className="demographics-score-ticks"><span>−2</span><span>−1</span><span>0</span><span>+1</span><span>+2</span></Box>
            </Box>
            <Typography  sx={{fontWeight: 700,  minWidth: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{signed(group.meanValence)}</Typography>
          </Stack>
          <Stack direction="row"   sx={{alignItems: "center", gap: 1.5,  mt: 2.5 }}>
            <Typography variant="body2"  sx={{fontWeight: 700,  flexShrink: 0 }}>平均熱量</Typography>
            <Box className="demographics-score-track" role="img" aria-label={`平均熱量 ${group.meanHeat.toFixed(1)}。尺度0から4`} sx={{ flex: 1 }}>
              <Box sx={{ width: `${group.meanHeat / 4 * 100}%`, height: "100%", backgroundColor: "#B28E54" }} />
            </Box>
            <Typography  sx={{fontWeight: 700,  whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{group.meanHeat.toFixed(1)} / 4</Typography>
          </Stack>
        </Box>}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2.5 }}>円の外周は上の感情構成と同じ割合です。平均が0に近くても、批判寄りと好意寄りが多い場合と、中央帯が多い場合を見分けられます。</Typography>
      <Button variant="contained" disableElevation fullWidth disabled={!group.count} endIcon={<ArrowForwardRoundedIcon />} onClick={() => onShowComments(group)} sx={{ mt: 2, borderRadius: 1.5, py: 1.1 }}>
        この{group.count}件をコメントで見る
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.1 }}>性別・年代をこのグループに合わせます。検索・感情・熱量の条件は保持します。</Typography>
    </>}
  </Box>;
}

function Comparison({ groups, filters, selectedKey, onSelect }: { groups: Group[]; filters: Filters; selectedKey: string | null; onSelect: (key: string | null) => void }) {
  const activeGroups = groups.filter(group => groupInRange(group, filters));
  const maximum = Math.max(1, ...activeGroups.map(group => group.count));
  const step = Math.max(1, Math.ceil(maximum / 3));
  const axisMax = step * 3;
  return <Box>
    <Box className="demographics-comparison-header demographics-comparison-grid">
      <Box />
      <Box>
        <Typography variant="body2"  sx={{ fontWeight: 700 }}>コメント件数（件）</Typography>
        <Stack direction="row"   sx={{gap: 1.5, flexWrap: "wrap",  my: 1 }}>
          {genders.filter(gender => filters.genders.includes(gender)).map(gender => <Stack key={gender} direction="row"   sx={{ alignItems: "center", gap: 0.6 }}>
            <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: genderColors[gender].bar }} />
            <Typography variant="caption">{genderLabels[gender]}</Typography>
          </Stack>)}
        </Stack>
        <Box className="demographics-axis"><span>0</span><span>{step}</span><span>{step * 2}</span><span>{axisMax}</span></Box>
      </Box>
      <Box>
        <Typography variant="body2"  sx={{ fontWeight: 700 }}>各グループ内の感情構成</Typography>
        <SentimentLegend />
        <Box className="demographics-axis"><span>0%</span><span>50%</span><span>100%</span></Box>
      </Box>
    </Box>
    {ages.filter((_, index) => index >= filters.ageRange[0] && index <= filters.ageRange[1]).map(age => {
      const ageGroups = activeGroups.filter(group => group.age === age);
      if (!ageGroups.length) return null;
      return <Box component="section" key={age} sx={{ borderTop: "1px solid", borderColor: "divider", py: 1.5 }}>
        <Stack direction="row"   sx={{alignItems: "center", gap: 1.2,  mb: 0.8 }}>
          <Chip label={ageLabels[age]} size="small" sx={{ backgroundColor: ageColors[age], color: "#344B2D", fontWeight: 700 }} />
          <Typography variant="body2"  sx={{ fontWeight: 600 }}>計{ageGroups.reduce((sum, group) => sum + group.count, 0)}件</Typography>
        </Stack>
        {ageGroups.map(group => <ButtonBase
          key={group.key}
          className="demographics-comparison-row demographics-comparison-grid"
          aria-pressed={selectedKey === group.key}
          aria-label={`${ageLabels[age]}、${genderLabels[group.gender]}、${group.count}件。${tones.map(tone => `${toneLabels[tone]} ${group.counts[tone]}件`).join("、")}。詳細を表示`}
          onClick={() => onSelect(selectedKey === group.key ? null : group.key)}
          sx={{ bgcolor: selectedKey === group.key ? "#e8f1fb" : "transparent", "&:hover": { backgroundColor: selectedKey === group.key ? "#e0ecfa" : "#f5f6f7" }, "&.Mui-focusVisible": { outline: "2px solid #065fd4", outlineOffset: 2 } }}
        >
          <Typography className="demographics-row-label" variant="body2">{genderLabels[group.gender]}</Typography>
          <Box className="demographics-count-cell">
            <Box className="demographics-count-track" aria-hidden="true">
              {[0, 1, 2, 3].map(tick => <Box key={tick} sx={{ position: "absolute", left: `${tick / 3 * 100}%`, top: -6, bottom: -6, borderLeft: "1px dashed #e3e6e9" }} />)}
              <Box sx={{ height: "100%", width: `${group.count / axisMax * 100}%`, backgroundColor: genderColors[group.gender].bar, position: "relative", borderRadius: 0.5 }} />
            </Box>
            <Typography variant="body2"  sx={{fontWeight: 600,  width: 35, flexShrink: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{group.count}</Typography>
          </Box>
          <Composition group={group} />
        </ButtonBase>)}
      </Box>;
    })}
    {!activeGroups.length && <Box sx={{ py: 6, textAlign: "center" }}><Typography color="text.secondary">性別の文体印象を選択すると、比較グラフを表示します。</Typography></Box>}
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>感情構成の分母は、各グループのコメント件数です。割合の丸めにより合計が100%にならない場合があります。</Typography>
  </Box>;
}

function DemographicMap({ groups, filters, selectedKey, onSelect }: { groups: Group[]; filters: Filters; selectedKey: string | null; onSelect: (key: string | null) => void }) {
  const maximum = Math.max(1, ...groups.filter(group => groupInRange(group, filters)).map(group => group.count));
  const legendCounts = [...new Set([Math.max(1, Math.round(maximum / 3)), Math.max(1, Math.round(maximum * 2 / 3)), maximum])];
  const diameter = (count: number) => Math.sqrt(count / maximum) * 68;
  return <Box sx={{ minWidth: 0 }}>
    <Box className="demographics-map" role="group" aria-label="性別×年代マップ。円全体の面積はコメント件数、中央の連続色は感情の向きの平均、外周は批判寄り・中央帯・好意寄りのコメントの割合です。">
      {[...ages].reverse().map(age => <Box className="demographics-map-row" key={age}>
        <Box className="demographics-map-age"><Typography variant="body2">{ageLabels[age]}</Typography></Box>
        {mapGenders.map(gender => {
          const group = groups.find(candidate => candidate.age === age && candidate.gender === gender)!;
          const ageIndex = ages.indexOf(age);
          const ageExcluded = ageIndex < filters.ageRange[0] || ageIndex > filters.ageRange[1];
          const genderExcluded = !filters.genders.includes(gender);
          const excluded = ageExcluded || genderExcluded;
          const isSelected = group.key === selectedKey;
          return <Box className={`demographics-map-cell ${excluded ? "demographics-map-excluded" : ""}`} key={gender}>
            {excluded ? <Typography variant="caption" color="text.secondary">{ageExcluded ? "範囲外" : "選択外"}</Typography> : group.count === 0 ? <Typography variant="caption" color="text.secondary">0件</Typography> : <ButtonBase
              className="demographics-map-point"
              aria-label={`${ageLabels[age]}、${genderLabels[gender]}、${group.count}件。感情の向きの平均${signed(group.meanValence)}。${tones.map(tone => `${toneLabels[tone]}${group.counts[tone]}件（${percentage(group.counts[tone], group.count)}%）`).join("、")}。詳細を表示`}
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : group.key)}
              sx={{ width: 75, height: 75, borderRadius: "50%", "&.Mui-focusVisible": { outline: "2px solid #065fd4", outlineOffset: 1 }, "&:hover": { backgroundColor: "#065fd408" } }}
            >
              <SentimentBubble count={group.count} counts={group.counts} mean={group.meanValence} size={diameter(group.count)} />
            </ButtonBase>}
          </Box>;
        })}
      </Box>)}
      <Box className="demographics-map-row demographics-map-labels">
        <Box />
        {mapGenders.map(gender => <Box key={gender} sx={{ textAlign: "center", px: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{genderLabels[gender]}</Typography>
          {!filters.genders.includes(gender) && <Typography variant="caption" color="text.secondary">選択外</Typography>}
        </Box>)}
      </Box>
    </Box>
    <Box className="demographics-map-legends">
      <Box>
        <Typography variant="body2"  sx={{ fontWeight: 600 }}>円全体の面積＝コメント件数</Typography>
        <Stack direction="row"   sx={{alignItems: "flex-end", gap: 1.6,  minHeight: 94, mt: 1 }}>
          {legendCounts.map(count => <Box key={count} sx={{ textAlign: "center" }}>
            <Box aria-hidden="true" sx={{ width: diameter(count), height: diameter(count), borderRadius: "50%", backgroundColor: "#b8bdc2", mx: "auto" }} />
            <Typography variant="caption" sx={{ display: "block", mt: 0.6 }}>{count}件</Typography>
          </Box>)}
        </Stack>
      </Box>
      <MeanSentimentLegend />
      <Box className="demographics-ring-legend">
        <Typography variant="body2" sx={{ fontWeight: 600 }}>外周＝コメントの感情構成</Typography>
        <SentimentLegend />
        <Box className="demographics-ring-examples">
          <Box role="img" aria-label="例：平均0、中央帯4件。外周はすべて灰色">
            <SentimentBubble count={4} counts={{ critical: 0, center: 4, positive: 0 }} mean={0} size={42} />
            <Typography variant="caption">中央帯のみ</Typography>
          </Box>
          <Box role="img" aria-label="例：平均0、批判寄り2件と好意寄り2件。外周は赤と緑が半分ずつ">
            <SentimentBubble count={4} counts={{ critical: 2, center: 0, positive: 2 }} mean={0} size={42} />
            <Typography variant="caption">批判・好意が半々</Typography>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>例：どちらも4件・平均0。外周で内訳の違いを表します。</Typography>
      </Box>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>外周はコメント間の内訳です。1件の中の「好意と批判の混在」とは別の指標です。中央帯は各コメントの感情の向きが−0.5〜+0.5の範囲です。</Typography>
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>軸は文体印象のカテゴリです。区分間の距離は実年齢の差を示しません。範囲外・選択外のセルにはデータ点を表示しません。</Typography>
  </Box>;
}

export function Demographics({ items, filters, view, onViewChange, selectedKey, onSelect, onShowComments }: Props) {
  const groups = useMemo(() => groupItems(items), [items]);
  const selectedGroup = groups.find(group => group.key === selectedKey && groupInRange(group, filters));
  return <Box component="section" aria-label="性別・年代別の分析" sx={{ pt: 1.5 }}>
    <ToggleButtonGroup value={view} exclusive onChange={(_, next: DemographicsView | null) => next && onViewChange(next)} aria-label="性別・年代別の表示" size="small" sx={{ mb: 1.5, gap: 1, "& .MuiToggleButtonGroup-grouped": { border: "0 !important", borderRadius: "8px !important", px: { xs: 1.4, sm: 2 }, py: 0.9, bgcolor: "#f0f1f3", color: "#4e5660", fontSize: { xs: 12, sm: 14 }, "&.Mui-selected": { bgcolor: "#202020", color: "#fff", "&:hover": { bgcolor: "#303030" } } } }}>
      <ToggleButton value="comparison"><BarChartRoundedIcon sx={{ mr: 0.8, fontSize: 19 }} />比較グラフ</ToggleButton>
      <ToggleButton value="map"><BubbleChartRoundedIcon sx={{ mr: 0.8, fontSize: 19 }} />性別×年代マップ</ToggleButton>
    </ToggleButtonGroup>
    <Typography component="h2" variant="h6"  sx={{ fontWeight: 700 }}>{view === "comparison" ? "年代ごとのコメント件数と感情" : "性別×年代ごとのコメント分布"}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>{view === "comparison" ? `性別の文体印象別・対象${items.length}件。行を選択すると詳しい内訳を確認できます。` : "円の面積＝件数・中央の連続色＝平均・外周＝批判／中央帯／好意の割合。円を選ぶと詳しい内訳を確認できます。"}</Typography>
    {view === "comparison" ? <>
      <Comparison groups={groups} filters={filters} selectedKey={selectedKey} onSelect={onSelect} />
      <GroupDetail group={selectedGroup} total={items.length} onShowComments={onShowComments} compact />
    </> : <Box className="demographics-map-layout">
      <DemographicMap groups={groups} filters={filters} selectedKey={selectedKey} onSelect={onSelect} />
      <GroupDetail group={selectedGroup} total={items.length} onShowComments={onShowComments} />
    </Box>}
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2.5, pt: 1.8, borderTop: "1px solid", borderColor: "divider" }}>文体印象は本人の年齢・性別ではありません。コメントの文体による分類であり、実際の投稿者属性や人数を示すものではありません。</Typography>
  </Box>;
}
