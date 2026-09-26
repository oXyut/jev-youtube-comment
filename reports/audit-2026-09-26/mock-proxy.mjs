import { createServer } from "node:http";
import { Readable } from "node:stream";

const tone = [
  [0.08, 0.12, 0.2, 0.45, 0.15],
  [0.55, 0.25, 0.12, 0.06, 0.02],
  [0.03, 0.07, 0.2, 0.4, 0.3],
  [0.14, 0.19, 0.42, 0.18, 0.07],
  [0.04, 0.05, 0.14, 0.27, 0.5],
  [0.33, 0.34, 0.2, 0.1, 0.03],
  [0.08, 0.11, 0.62, 0.13, 0.06],
  [0.02, 0.06, 0.12, 0.35, 0.45],
];
const comments = [
  "曲が始まった瞬間、昔の思い出がよみがえりました。今聴いても楽しいです。",
  "音は好きですが、途中の広告が多くて最後まで集中できませんでした。",
  "何度も聴きたくなる曲です。映像もきれいで元気が出ます。",
  "この動画はいつ公開されたのでしょうか？ 元の映像との違いも知りたいです。",
  "最高！ 家族と一緒に歌ってしまいました。",
  "画質は良くなったけれど、古い映像の雰囲気のほうが好きです。",
  "懐かしいですね。リマスター版の公開をありがとうございます。",
  "この曲を聴くと週末が楽しみになります。友人にも送りたいです。",
];
const genders = ["ambiguous", "masculine_coded", "feminine_coded", "ambiguous"];
const ages = ["working_adult", "university", "middle_older", "middle_high_school"];
const record = (values) => Object.fromEntries(values.map((value, index) => [String(index), value]));
const items = comments.map((text, index) => ({
  id: `sample-${index + 1}`,
  text,
  publishedAt: "2026-09-25T00:00:00Z",
  likeCount: [120, 18, 72, 5, 201, 34, 63, 48][index],
  gender: genders[index % genders.length],
  age: ages[index % ages.length],
  genderProbability: 0.57 + index * 0.03,
  ageProbability: 0.46 + index * 0.04,
  genderProbabilities: { masculine_coded: index % 4 === 1 ? 0.66 : 0.18, feminine_coded: index % 4 === 2 ? 0.65 : 0.2, ambiguous: index % 4 === 0 || index % 4 === 3 ? 0.62 : 0.15 },
  ageProbabilities: { pre_elementary: 0.02, middle_high_school: index % 4 === 3 ? 0.58 : 0.08, university: index % 4 === 1 ? 0.56 : 0.12, working_adult: index % 4 === 0 ? 0.63 : 0.17, middle_older: index % 4 === 2 ? 0.57 : 0.08 },
  valenceProbabilities: record(tone[index]),
  heatProbabilities: record(index % 2 ? [0.3, 0.25, 0.25, 0.15, 0.05] : [0.03, 0.08, 0.18, 0.36, 0.35]),
  valenceConfidence: 0.63 + index * 0.02,
  heatConfidence: 0.59 + index * 0.02,
  bothSidesProbability: [0.12, 0.68, 0.08, 0.21, 0.06, 0.73, 0.11, 0.09][index],
}));

createServer(async (req, res) => {
  if (req.url?.startsWith("/api/comments")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "aaaaaaaaaaa", title: "レビュー用サンプル動画", channel: "サンプルチャンネル", count: items.length }));
    return;
  }
  if (req.url?.startsWith("/api/classify")) {
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
    const send = (event) => res.write(`${JSON.stringify(event)}\n`);
    send({ type: "start", total: items.length });
    for (const [index, item] of items.entries()) {
      send({ type: "item", item, processed: index + 1, total: items.length, speed: 3.5, usage: { inputTokens: (index + 1) * 120, outputTokens: (index + 1) * 30, estimatedCostUsd: (index + 1) * 0.000005 } });
    }
    send({ type: "complete", processed: items.length, total: items.length, failures: 0, speed: 3.5, elapsedMs: 2300, usage: { inputTokens: 960, outputTokens: 240, estimatedCostUsd: 0.00004 } });
    res.end();
    return;
  }
  try {
    const upstream = await fetch(`http://127.0.0.1:3000${req.url}`, { method: req.method });
    const headers = Object.fromEntries(upstream.headers);
    delete headers["content-encoding"];
    delete headers["content-length"];
    res.writeHead(upstream.status, headers);
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
    else res.end();
  } catch (error) {
    res.writeHead(502);
    res.end(String(error));
  }
}).listen(3001, "127.0.0.1", () => console.log("Local review fixture: http://127.0.0.1:3001"));
