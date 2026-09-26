import { analysisStoreErrorResponse, listAnalyses, saveAnalysis } from "@/lib/analysis-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return Response.json(await listAnalyses(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return analysisStoreErrorResponse(error); }
}

export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); }
  catch { return Response.json({ error: "JSONの形式が正しくありません。" }, { status: 400 }); }
  try { return Response.json(await saveAnalysis(input), { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return analysisStoreErrorResponse(error); }
}
