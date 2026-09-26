import { analysisStoreErrorResponse, loadAnalysis } from "@/lib/analysis-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json(await loadAnalysis(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return analysisStoreErrorResponse(error); }
}
