import { NextRequest } from "next/server";
import { classifyComment, getAnalyzerMetadata } from "@/lib/jev";
import { getComments, parseVideoId } from "@/lib/youtube";
import { commentLimit, parseCommentScope, type CommentScope } from "@/lib/comment-scope";
export const runtime = "nodejs";
export const maxDuration = 300;
function line(data: unknown) { return new TextEncoder().encode(JSON.stringify(data) + "\n"); }
const INPUT_PRICE_USD_PER_MILLION = 0.042;
function usageSnapshot(inputTokens: number, outputTokens: number) {
  return { inputTokens, outputTokens, estimatedCostUsd: inputTokens * INPUT_PRICE_USD_PER_MILLION / 1_000_000 };
}
export async function POST(req: NextRequest) {
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!input || typeof input !== "object" || Array.isArray(input) || (input.url !== undefined && typeof input.url !== "string")) return Response.json({ error: "動画URLと有効な分析範囲を指定してください。" }, { status: 400 });
  let selection: CommentScope;
  try { selection = parseCommentScope({ ...input, scope: input.scope === undefined ? "first100" : input.scope }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "分析範囲が不正です。" }, { status: 400 }); }
  const id = parseVideoId(typeof input.url === "string" ? input.url : "");
  if (!id) return new Response(JSON.stringify({ error: "YouTube動画のURLを入力してください。" }), { status: 400 });
  if (!process.env.TYPESAFE_API_KEY) return new Response(JSON.stringify({ error: "TYPESAFE_API_KEY が設定されていません。" }), { status: 503 });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const started = Date.now();
      const send = (event: Record<string, unknown>) => { try { controller.enqueue(line({ elapsedMs: Date.now() - started, ...event })); } catch {} };
      void (async () => {
        try {
          send({ type: "status", phase: "fetching", message: "YouTubeからコメントを取得中…", startedAt: new Date(started).toISOString(), analyzer: getAnalyzerMetadata() });
          const { comments, total } = await getComments(id, commentLimit(selection));
          if (total > 100 && input.scope === undefined) { send({ type: "error", message: "コメントが100件を超えています。分析範囲の選択が必要です。" }); return; }
          if (!comments.length) { send({ type: "error", message: "取得できる公開コメントがありません。" }); return; }
          const processingStarted = Date.now();
          send({ type: "start", total: comments.length, sourceTotal: total });
          let next = 0; let done = 0; let failures = 0; let inputTokens = 0; let outputTokens = 0;
          const workers = Array.from({ length: Math.min(4, comments.length) }, async () => {
            while (true) {
              const i = next++; if (i >= comments.length) return;
              try {
                const result = await classifyComment(comments[i]); done++;
                inputTokens += result.usage.inputTokens; outputTokens += result.usage.outputTokens;
                send({ type: "item", item: result.item, usage: usageSnapshot(inputTokens, outputTokens), processed: done, total: comments.length, speed: +(done / Math.max((Date.now() - processingStarted) / 1000, .01)).toFixed(2) });
              } catch (error) {
                failures++; done++;
                send({ type: "item_error", id: comments[i].id, message: error instanceof Error ? error.message : "分類に失敗", usage: usageSnapshot(inputTokens, outputTokens), processed: done, total: comments.length, speed: +(done / Math.max((Date.now() - processingStarted) / 1000, .01)).toFixed(2) });
              }
            }
          });
          await Promise.all(workers);
          send({ type: "complete", processed: done, total: comments.length, failures, usage: usageSnapshot(inputTokens, outputTokens), elapsedMs: Date.now() - started, classifyElapsedMs: Date.now() - processingStarted, completedAt: new Date().toISOString() });
        } catch (error) { send({ type: "error", message: error instanceof Error ? error.message : "処理に失敗しました。" }); }
        finally { try { controller.close(); } catch {} }
      })();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
