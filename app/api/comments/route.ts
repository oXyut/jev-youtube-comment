import { NextRequest, NextResponse } from "next/server";
import { getVideoInfo, parseVideoId } from "@/lib/youtube";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  const id = parseVideoId(raw);
  if (!id) return NextResponse.json({ error: "YouTube動画のURLを入力してください。" }, { status: 400 });
  try { return NextResponse.json(await getVideoInfo(id)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "動画情報を取得できませんでした。" }, { status: 502 }); }
}
