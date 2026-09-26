"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Box, Button, MenuItem, Select, Tooltip, Typography } from "@mui/material";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { BOTH_SIDES_THRESHOLD, heatOf, toneColors, toneCounts, toneLabels, toneOf, valenceOf, type Item, type Tone } from "@/lib/analysis";
import { likeBubbleRadius } from "@/lib/comment-map";
import styles from "./comment-overview.module.css";

type Props = {
  items: Item[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  expanded: boolean;
  onToggle: () => void;
  likeScaleMaximum: number;
  onShowMixed: () => void;
  mixedOnly: boolean;
};

const tones: Tone[] = ["critical", "center", "positive"];
const bounded = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
const author = (item: Item) => item.authorDisplayName?.trim() || "匿名の投稿者";

function EmotionMap({ items, selectedId, onSelect, likeScaleMaximum }: Pick<Props, "items" | "selectedId" | "onSelect" | "likeScaleMaximum">) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Use the rendered width so labels and points keep their readable size on phones.
  const x = (value: number) => 42 + (bounded(value, -2, 2) + 2) / 4 * (width - 64);
  const y = (value: number) => 292 - bounded(value, 0, 4) / 4 * 256;
  const selected = items.find(item => item.id === selectedId);
  const bySize = [...items].sort((left, right) => right.likeCount - left.likeCount);
  const ordered = selected ? [...bySize.filter(item => item.id !== selectedId), selected] : bySize;

  return <div className={styles.mapPanel}>
    <svg ref={svg} viewBox={`0 0 ${width} 340`} className={styles.map} role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <title id={`${id}-title`}>コメント分布：感情の向き −2〜+2 × 熱量 0〜4</title>
      <desc id={`${id}-description`}>左は批判寄り、右は好意寄り。下は冷静、上は熱量が高いコメントです。円が大きいほど取得時のいいねが多く、紫枠は好意と批判の両方を含むと推定したコメントです。点を選ぶと原文と分析内訳を開きます。</desc>
      <rect x={x(-.5)} y={y(4)} width={x(.5) - x(-.5)} height={y(0) - y(4)} fill="#F1F3F4" />
      <text x="0" y="14" fontSize="12" fill="#606060">熱量 ↑ 高い</text>
      {[0, 1, 2, 3, 4].map(value => <g key={`heat-${value}`}>
        <line x1={x(-2)} x2={x(2)} y1={y(value)} y2={y(value)} stroke="#E8E8E8" />
        <text x="26" y={y(value) + 4} textAnchor="end" fontSize="12" fill="#606060">{value}</text>
      </g>)}
      {[-2, -1, 0, 1, 2].map(value => <g key={`valence-${value}`}>
        <line x1={x(value)} x2={x(value)} y1={y(4)} y2={y(0)} stroke={value === 0 ? "#AEB4B9" : "#E8E8E8"} strokeDasharray={value === 0 ? undefined : "3 4"} />
        <text x={x(value)} y="310" textAnchor="middle" fontSize="12" fill="#606060">{value > 0 ? `+${value}` : value}</text>
      </g>)}
      <text x={x(-2)} y="332" fontSize="12" fill="#606060">← 批判</text>
      <text x={x(0)} y="332" textAnchor="middle" fontSize="12" fill="#606060">感情の向き</text>
      <text x={x(2)} y="332" textAnchor="end" fontSize="12" fill="#606060">好意 →</text>
      {ordered.map(item => {
        const valence = valenceOf(item), heat = heatOf(item);
        const cx = x(valence), cy = y(heat);
        const active = item.id === selectedId;
        const mixed = (item.bothSidesProbability ?? 0) >= BOTH_SIDES_THRESHOLD;
        const radius = likeBubbleRadius(item.likeCount, likeScaleMaximum);
        const color = toneColors[toneOf(item)];
        return <Tooltip key={item.id} describeChild placement="top" enterDelay={150} leaveDelay={100} disableTouchListener
          slotProps={{ tooltip: { sx: { maxWidth: 320, p: 1.5, bgcolor: "#212121" } }, arrow: { sx: { color: "#212121" } } }}
          title={selectedId ? "" : <Box sx={{ fontSize: 12, lineHeight: 1.65, overflowWrap: "anywhere" }}>
            <Box sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{author(item)}</Box>
            <Box sx={{ my: .75, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden", whiteSpace: "pre-wrap" }}>{item.text}</Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: .5 }}>
              <span>感情の向き {signed(valence)}</span><span>熱量 {heat.toFixed(1)}</span>
              <span>いいね {item.likeCount.toLocaleString()}件</span><span>好意・批判の混在 {item.bothSidesProbability === null ? "取得不可" : `${Math.round(item.bothSidesProbability * 100)}%`}</span>
            </Box>
            <Box sx={{ mt: .75, opacity: .75, fontSize: 11 }}>クリックで全文と分析内訳を表示</Box>
          </Box>}>
          <g role="button" tabIndex={0} aria-pressed={active} aria-haspopup="dialog"
          aria-label={`${author(item)}、${item.text.slice(0, 60)}。感情 ${signed(valence)}、熱量 ${heat.toFixed(1)}、いいね ${item.likeCount}件。原文と分析内訳を開く`}
          className={styles.mapPoint} onClick={() => onSelect(active ? null : item.id)}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(active ? null : item.id); } }}>
          <circle cx={cx} cy={cy} r={Math.max(12, radius + 3)} fill="transparent" />
          <circle className={styles.focusRing} cx={cx} cy={cy} r={radius + 3} fill="none" stroke="#065FD4" strokeWidth="2" opacity={active ? 1 : 0} />
          <circle className={styles.bubble} cx={cx} cy={cy} r={radius} fill={color} fillOpacity={active ? .95 : .6} stroke={mixed ? "#766398" : "white"} strokeWidth={mixed ? 2 : 1} />
          </g>
        </Tooltip>;
      })}
      {items.length === 0 && <text x={x(0)} y="164" textAnchor="middle" fontSize="13" fill="#606060">条件に合うコメントはありません</text>}
    </svg>
    <div className={styles.mapFooter}>
      <Select size="small" displayEmpty value={selected?.id ?? ""} onChange={event => onSelect(event.target.value || null)}
        disabled={items.length === 0} inputProps={{ "aria-label": "感情マップのコメントを選択" }} className={styles.commentSelect}>
        <MenuItem value="">点を選ぶと全文と分析内訳を表示</MenuItem>
        {items.map((item, index) => <MenuItem key={item.id} value={item.id}>{index + 1}. {author(item)} · {signed(valenceOf(item))} / 熱量 {heatOf(item).toFixed(1)}</MenuItem>)}
      </Select>
      <span className={styles.mapHint}>ホバーで概要・クリックで詳細<br />重なる点はメニューから選択できます</span>
    </div>
  </div>;
}

export function CommentOverview({ items, selectedId, onSelect, expanded, onToggle, likeScaleMaximum, onShowMixed, mixedOnly }: Props) {
  const id = useId();
  const counts = useMemo(() => toneCounts(items), [items]);
  const mixedCount = useMemo(() => items.filter(item => (item.bothSidesProbability ?? 0) >= BOTH_SIDES_THRESHOLD).length, [items]);
  const unknownCount = items.filter(item => item.bothSidesProbability === null).length;
  const legendLikes = [...new Set([0, Math.max(1, Math.round(likeScaleMaximum / 4)), likeScaleMaximum])].filter(value => value <= likeScaleMaximum);
  return <Box component="section" aria-label="コメントの傾向" className={styles.overview}>
    <div className={styles.heading}>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>感情の向き × 熱量</Typography>
      <Button color="inherit" size="small" endIcon={expanded ? <ExpandLess /> : <ExpandMore />} onClick={onToggle} aria-expanded={expanded} aria-controls={`${id}-map`}>
        {expanded ? "マップを隠す" : "マップを表示"}
      </Button>
    </div>
    <div className={expanded ? styles.overviewGrid : styles.collapsedGrid}>
      {expanded && <div id={`${id}-map`}><EmotionMap items={items} selectedId={selectedId} onSelect={onSelect} likeScaleMaximum={likeScaleMaximum} /></div>}
      <div className={styles.summary}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>対象の感情構成 · {items.length.toLocaleString()}件</Typography>
        <div className={styles.stackedBar} role="img" aria-label={tones.map(tone => `${toneLabels[tone]} ${counts[tone]}件`).join("、")}>
          {tones.map(tone => <span key={tone} style={{ width: `${items.length ? counts[tone] / items.length * 100 : 0}%`, background: toneColors[tone] }} />)}
        </div>
        <div className={styles.toneLegend}>{tones.map(tone => <div key={tone}>
          <span className={styles.toneName}><span style={{ background: toneColors[tone] }} />{toneLabels[tone]}</span>
          <span className={styles.toneCount}>{counts[tone]}件 <small>· {items.length ? Math.round(counts[tone] / items.length * 100) : 0}%</small></span>
        </div>)}</div>
        <div className={styles.mixedSummary}>
          <div className={styles.mixedLabel}><span>好意と批判の両方を含むコメント（推定）</span><span>{mixedCount}件 / {items.length}件</span></div>
          <div className={styles.mixedTrack} role="img" aria-label={`両方を含むと推定したコメント ${mixedCount}件、対象${items.length}件`}><span style={{ width: `${items.length ? mixedCount / items.length * 100 : 0}%` }} /></div>
          <Typography variant="caption" component="p" color="text.secondary">「好きだけど音が大きい」のような、褒める点と不満点を一緒に述べた意見を探せます。</Typography>
          <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: .6 }}>Jevの「両方を含む」推定確率が50%以上のコメントを数えています。50%は集計の基準で、文章の半分が批判という意味ではありません。{unknownCount > 0 && `判定未取得：${unknownCount}件。`}</Typography>
          <Button size="small" onClick={onShowMixed} disabled={!mixedCount || mixedOnly} sx={{ mt: .5, px: 0 }}>{mixedOnly ? "該当コメントを表示中" : `該当する${mixedCount}件を見る →`}</Button>
        </div>
        {expanded && <>
          <div className={styles.likeLegend}><Typography variant="caption">円の大きさ＝取得時のいいね数</Typography><div>{legendLikes.map(count => <span key={count}><svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><circle cx="17" cy="17" r={likeBubbleRadius(count, likeScaleMaximum)} fill="#87919A" fillOpacity=".6" /></svg><small>{count}件</small></span>)}</div><Typography variant="caption" color="text.secondary">0件・少数も見える最小サイズで表示</Typography></div>
          <div className={styles.mapLegend}><span><i className={styles.legendMixed} />紫枠＝好意と批判の両方を含む推定</span><span>0＝冷静 / 4＝高い熱量</span></div>
        </>}
      </div>
    </div>
  </Box>;
}
