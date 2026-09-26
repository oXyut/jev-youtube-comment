"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Avatar, Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton, Paper, Stack, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight, Close, PersonOutlined, ThumbUpOutlined } from "@mui/icons-material";
import { ageColors, ageLabels, genderColors, genderLabels, heatOf, toneColors, toneForScore, valenceOf, type Item } from "@/lib/analysis";
import { central80Interval, heatStages, valenceStages } from "@/lib/scales";
import styles from "./comments-view.module.css";

type CommentsViewProps = {
  items: Item[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const PAGE_SIZE = 6;
const HEAT_COLOR = "#B28E54";
const MIXED_COLOR = "#8E82AE";
const bounded = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
const percent = (value: number | null) => value === null ? "取得不可" : `${(value * 100).toFixed(1)}%`;
const author = (item: Item) => item.authorDisplayName?.trim() || "匿名の投稿者";

function postedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "投稿日時不明" : new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Tokyo" }).format(date);
}

/** A center-origin bar; every comment uses the same -2 to +2 coordinates. */
function ValenceBar({ value }: { value: number }) {
  const width = Math.abs(bounded(value, -2, 2)) / 4 * 100;
  return <div className={styles.metric} aria-label={`感情の向き ${signed(value)}、範囲 マイナス2からプラス2`}>
    <div className={styles.metricGraphic}>
      <div className={styles.valenceTrack}>
        <span className={styles.centerBand} />
        <span className={styles.valenceFill} style={{ left: `${value < 0 ? 50 - width : 50}%`, width: `${width}%`, background: toneColors[toneForScore(value)] }} />
        <span className={styles.centerLine} />
      </div>
      <div className={styles.ticks} aria-hidden="true"><span>−2</span><span>0</span><span>+2</span></div>
    </div>
    <span className={styles.metricValue}>{signed(value)}</span>
  </div>;
}

function LinearBar({ value, max, color, label, probability = false }: { value: number | null; max: number; color: string; label: string; probability?: boolean }) {
  return <div className={styles.metric} aria-label={`${label} ${value === null ? "取得不可" : probability ? percent(value) : value.toFixed(1)}`}>
    <div className={styles.linearTrack}><span style={{ width: value === null ? "0%" : `${bounded(value / max * 100, 0, 100)}%`, background: color }} /></div>
    <span className={styles.metricValue}>{value === null ? "取得不可" : probability ? `${Math.round(value * 100)}%` : value.toFixed(1)}</span>
  </div>;
}

function StyleBadges({ item }: { item: Item }) {
  const gender = genderColors[item.gender] ?? genderColors.ambiguous;
  return <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap" }} className={styles.badges}>
    <Chip size="small" label={ageLabels[item.age] ?? "取得不可"} sx={{ bgcolor: ageColors[item.age] ?? "#F1F5EE", color: "#344B2D", borderRadius: 1, fontSize: 12 }} />
    <Chip size="small" label={genderLabels[item.gender] ?? "判定保留"} sx={{ bgcolor: gender.background, color: gender.text, borderRadius: 1, fontSize: 12 }} />
  </Stack>;
}

function Distribution({ title, probabilities, labels, colors }: { title: string; probabilities: Record<string, number>; labels: Record<string, string>; colors: Record<string, string> }) {
  const available = Object.values(probabilities).some((probability) => probability > 0);
  return <Box className={styles.distribution}>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>{title}</Typography>
    {available ? Object.entries(labels).map(([key, label]) => <div className={styles.probabilityRow} key={key}>
      <span>{label}</span>
      <div className={styles.probabilityTrack}><span style={{ width: `${bounded((probabilities[key] ?? 0) * 100, 0, 100)}%`, background: colors[key] ?? "#87919A" }} /></div>
      <span className={styles.probabilityValue}>{((probabilities[key] ?? 0) * 100).toFixed(1)}%</span>
    </div>) : <Typography variant="body2" color="text.secondary">確率を取得できませんでした。</Typography>}
    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>各バーの共通尺度：0〜100%</Typography>
  </Box>;
}

function ScoreDetail({ item, kind }: { item: Item; kind: "valence" | "heat" }) {
  const isValence = kind === "valence";
  const stages = isValence ? valenceStages : heatStages;
  const probabilities = isValence ? item.valenceProbabilities : item.heatProbabilities;
  const mean = isValence ? valenceOf(item) : heatOf(item);
  const confidence = isValence ? item.valenceConfidence : item.heatConfidence;
  const range = central80Interval(probabilities, stages);
  const labels = Object.fromEntries(stages.map((stage) => [String(stage.level), stage.label]));
  const colors = Object.fromEntries(stages.map((stage) => [String(stage.level), isValence ? toneColors[toneForScore(stage.anchor)] : HEAT_COLOR]));
  const available = Object.values(probabilities).some((probability) => probability > 0);
  const format = isValence ? signed : (value: number) => value.toFixed(1);
  return <div>
    <Distribution title={`${isValence ? "感情の向き" : "熱量"}：5段階の確率（平均 ${format(mean)}）`} probabilities={probabilities} labels={labels} colors={colors} />
    <div className={styles.scoreMeta}>
      <span>中央80%区間（10〜90%点）</span><span>{available ? `${format(range.low)} 〜 ${format(range.high)}` : "取得不可"}</span>
      <span>Jev confidence</span><span>{confidence === null ? "取得不可" : confidence.toFixed(2)}</span>
    </div>
  </div>;
}

function AnalysisDetail({ item, id }: { item: Item; id: string }) {
  const genderBars = Object.fromEntries(Object.entries(genderColors).map(([key, color]) => [key, color.bar]));
  return <Box id={id} role="region" aria-label={`${author(item)}の分析内訳`} className={styles.detail}>
    <div className={styles.detailGrid}><ScoreDetail item={item} kind="valence" /><ScoreDetail item={item} kind="heat" /></div>
    <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.8 }}>
      中央80%区間は各軸の段階確率から求めた範囲です。Jev confidence は確率分布の集中度を表す別指標で、確率・正答率ではありません。感情の向きと熱量は別々に評価しています。
    </Typography>
    <div className={styles.detailGrid} style={{ marginTop: 20 }}>
      <Distribution title="年代の文体印象：選択確率" probabilities={item.ageProbabilities} labels={ageLabels} colors={ageColors} />
      <Distribution title="性別の文体印象：選択確率" probabilities={item.genderProbabilities} labels={genderLabels} colors={genderBars} />
    </div>
    <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>文体印象は本人の年齢・性別ではありません。</Typography>
    <Typography variant="body2" sx={{ mt: 2 }}>好意と批判の混在：{percent(item.bothSidesProbability)}</Typography>
    <Typography variant="caption" component="p" color="text.secondary" sx={{ lineHeight: 1.8 }}>
      Noul は「このコメントは、好意的な内容と批判的な内容の両方を含んでいますか？」という命題が真である確率です。本文内で各感情が占める割合や、分類の正答率ではありません。
    </Typography>
  </Box>;
}

export function CommentsView({ items, selectedId, onSelect }: CommentsViewProps) {
  const [page, setPage] = useState(1);
  const componentId = useId();
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const selectedIndex = useMemo(() => items.findIndex((item) => item.id === selectedId), [items, selectedId]);
  useEffect(() => { if (selectedIndex >= 0) setPage(Math.floor(selectedIndex / PAGE_SIZE) + 1); }, [selectedIndex]);
  useEffect(() => { setPage((current) => Math.min(current, pages)); }, [pages]);
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const visibleItems = items.slice(offset, offset + PAGE_SIZE);
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;
  const turnPage = (next: number) => { onSelect(null); setPage(next); };

  return <Box component="section" aria-label="コメントと分析結果">
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1, mb: 1.5 }}>
      <Typography component="h2" variant="h6" sx={{ fontSize: 18, fontWeight: 700 }}>コメント <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>{items.length.toLocaleString()}件</Typography></Typography>
    </Stack>
    <div className={`${styles.lanes} ${styles.laneHeader}`} aria-hidden="true">
      <span>原文</span><span>感情の向き<small>批判 −2 ← 0 → +2 好意</small></span><span>熱量<small>0 冷静 → 4 高い</small></span><span>好意と批判の混在<small>同じコメントに両方を含む確率</small></span><span>文体の印象</span>
    </div>
    {visibleItems.length ? <div>{visibleItems.map((item) => {
      const selected = item.id === selectedId;
      return <article key={item.id} className={`${styles.comment} ${selected ? styles.selectedComment : ""}`} aria-label={`${author(item)}のコメント`}>
        <div className={styles.lanes}>
          <div className={styles.commentBody}>
            <Avatar src={item.authorProfileImageUrl || undefined} alt="" sx={{ width: { xs: 36, sm: 40 }, height: { xs: 36, sm: 40 }, bgcolor: "#ECEFF1", color: "#65717C" }}><PersonOutlined /></Avatar>
            <div className={styles.commentText}>
              <div className={styles.byline}><strong title={author(item)}>{author(item)}</strong><time dateTime={item.publishedAt}>{postedAt(item.publishedAt)}</time></div>
              <Typography component="p" variant="body2" className={styles.originalText}>{item.text}</Typography>
              <div className={styles.commentActions}>
                <span className={styles.likes} aria-label={`いいね ${item.likeCount.toLocaleString()}件`} title={`いいね ${item.likeCount.toLocaleString()}件`}><ThumbUpOutlined sx={{ fontSize: 17, flexShrink: 0 }} /><span>{item.likeCount.toLocaleString()}</span></span>
                <Button size="small" sx={{ minWidth: 0, p: 0, fontSize: 12, whiteSpace: "nowrap" }} onClick={() => onSelect(item.id)} aria-haspopup="dialog">全文を読む</Button>
                <Button size="small" sx={{ minWidth: 0, p: 0, fontSize: 12, whiteSpace: "nowrap" }} onClick={() => onSelect(item.id)} aria-haspopup="dialog">分析の内訳</Button>
              </div>
            </div>
          </div>
          <div className={styles.metricLane}><span className={styles.mobileLabel}>感情の向き <small>−2〜+2</small></span><ValenceBar value={valenceOf(item)} /></div>
          <div className={styles.metricLane}><span className={styles.mobileLabel}>熱量 <small>0〜4</small></span><LinearBar value={heatOf(item)} max={4} color={HEAT_COLOR} label="熱量" /></div>
          <div className={styles.metricLane}><span className={styles.mobileLabel}>好意と批判の混在 <small>0〜100%</small></span><LinearBar value={item.bothSidesProbability} max={1} color={MIXED_COLOR} label="好意と批判の混在確率" probability /></div>
          <div className={styles.metricLane}><span className={styles.mobileLabel}>文体の印象</span><StyleBadges item={item} /></div>
        </div>
      </article>;
    })}</div> : <Paper variant="outlined" sx={{ textAlign: "center", py: 6, px: 2, borderRadius: 2 }}><Typography sx={{ fontWeight: 600 }}>条件に一致するコメントはありません</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>検索や絞り込み条件を変更してください。性別の文体印象は「全選択」で戻せます。</Typography></Paper>}
    <div className={styles.explanations}>
      <p><b>好意と批判の混在</b>：同じコメントに両方を含む確率。「好きだけど音が大きい」のように、好意と批判が同じコメントに含まれる確率です。</p>
    </div>
    <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: 1.5, mt: 2 }}>
      <Typography variant="caption" color="text.secondary">中央帯：−0.5〜+0.5（表示上の区分） · 文体バッジの確率は「分析の内訳」に表示</Typography>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexShrink: 0 }}>
        <Typography variant="body2" aria-live="polite">{items.length ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, items.length)}` : "0"} / {items.length.toLocaleString()}件</Typography>
        <IconButton aria-label="前のページ" disabled={currentPage <= 1} onClick={() => turnPage(currentPage - 1)} size="small"><ChevronLeft /></IconButton>
        <IconButton aria-label="次のページ" disabled={currentPage >= pages} onClick={() => turnPage(currentPage + 1)} size="small"><ChevronRight /></IconButton>
      </Stack>
    </Stack>
    <Dialog open={Boolean(selectedItem)} onClose={() => onSelect(null)} fullWidth maxWidth="md" aria-labelledby={`${componentId}-dialog-title`} slotProps={{ paper: { sx: { m: { xs: 1, sm: 3 }, width: { xs: "calc(100% - 16px)", sm: "calc(100% - 48px)" }, maxHeight: "calc(100% - 32px)" } } }}>
      <DialogTitle id={`${componentId}-dialog-title`} sx={{ pr: 7 }}>コメントの詳細<IconButton aria-label="コメントの詳細を閉じる" onClick={() => onSelect(null)} sx={{ position: "absolute", right: 12, top: 12 }}><Close /></IconButton></DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        {selectedItem && <>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, mb: 2 }}>
            <Avatar src={selectedItem.authorProfileImageUrl || undefined} alt="" sx={{ bgcolor: "#ECEFF1", color: "#65717C" }}><PersonOutlined /></Avatar>
            <div className={styles.dialogByline}><Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>{author(selectedItem)}</Typography><Typography variant="caption" color="text.secondary"><time dateTime={selectedItem.publishedAt}>{postedAt(selectedItem.publishedAt)}</time> · いいね {selectedItem.likeCount.toLocaleString()}件</Typography></div>
          </Stack>
          <Box component="section" aria-label="コメント全文">
            <Typography component="p" variant="body2" className={styles.fullText}>{selectedItem.text}</Typography>
            <Box sx={{ mt: 2 }}><StyleBadges item={selectedItem} /></Box>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>文体印象は本人の年齢・性別ではありません。</Typography>
          </Box>
          <Divider sx={{ my: 3 }} />
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>分析の内訳</Typography>
          <AnalysisDetail item={selectedItem} id={`${componentId}-detail-${selectedItem.id}`} />
        </>}
      </DialogContent>
    </Dialog>
  </Box>;
}
