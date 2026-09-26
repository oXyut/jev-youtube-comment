import { constants } from "node:fs";
import { mkdir, open, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  analysisArchiveSummary, ArchiveValidationError, createAnalysisArchive, isAnalysisArchiveId, parseAnalysisArchive,
  type AnalysisArchive, type AnalysisArchiveSummary,
} from "./analysis-archive";

export class AnalysisStoreError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "AnalysisStoreError"; }
}

function hasCode(error: unknown, code: string): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === code;
}

export type AnalysisArchiveList = { analyses: AnalysisArchiveSummary[]; skippedCount: number };

/** The directory is server-controlled; request data never chooses a path or filename. */
export function createAnalysisStore(directory = path.join(process.cwd(), ".data", "analyses")) {
  async function load(id: string): Promise<AnalysisArchive> {
    if (!isAnalysisArchiveId(id)) throw new ArchiveValidationError("保存IDの形式が正しくありません。");
    const filename = path.join(directory, `${id.toLowerCase()}.json`);
    let contents: string;
    try {
      // Refuse symbolic links, including ones created outside the application.
      const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!(await file.stat()).isFile()) throw new AnalysisStoreError("指定された保存データが見つかりません。", 404);
        contents = await file.readFile("utf8");
      } finally { await file.close(); }
    } catch (error) {
      if (error instanceof AnalysisStoreError) throw error;
      if (hasCode(error, "ENOENT") || hasCode(error, "ELOOP")) throw new AnalysisStoreError("指定された保存データが見つかりません。", 404);
      throw new AnalysisStoreError("保存データを読み込めませんでした。保存先へのアクセスを確認してください。", 500);
    }
    let archive: AnalysisArchive;
    try { archive = parseAnalysisArchive(JSON.parse(contents)); }
    catch (error) {
      const detail = error instanceof ArchiveValidationError ? error.message : "JSONの形式が正しくありません。";
      throw new AnalysisStoreError(`保存ファイルが壊れているか、未対応の形式です。${detail}`, 400);
    }
    if (archive.id !== id.toLowerCase()) throw new AnalysisStoreError("保存ファイル内のIDが一致しません。", 400);
    return archive;
  }

  async function save(input: unknown): Promise<AnalysisArchive> {
    // Identity and savedAt are authoritative server values; supplied values are ignored.
    const archive = createAnalysisArchive(input, { id: randomUUID(), savedAt: new Date().toISOString() });
    const temporary = path.join(directory, `.${archive.id}.${randomUUID()}.tmp`);
    const destination = path.join(directory, `${archive.id}.json`);
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify(archive, null, 2) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch {
      await unlink(temporary).catch(() => undefined);
      throw new AnalysisStoreError("分析結果を保存できませんでした。保存先への書き込み権限を確認してください。", 500);
    }
    return archive;
  }

  async function list(): Promise<AnalysisArchiveList> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (hasCode(error, "ENOENT")) return { analyses: [], skippedCount: 0 };
      throw new AnalysisStoreError("保存履歴を読み込めませんでした。保存先へのアクセスを確認してください。", 500);
    }
    const analyses: AnalysisArchiveSummary[] = [];
    let skippedCount = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -5);
      if (!isAnalysisArchiveId(id)) continue;
      try { analyses.push(analysisArchiveSummary(await load(id))); }
      catch { skippedCount++; }
    }
    analyses.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt) || right.id.localeCompare(left.id));
    return { analyses, skippedCount };
  }
  return { save, load, list };
}

const store = createAnalysisStore();
export const saveAnalysis = store.save;
export const loadAnalysis = store.load;
export const listAnalyses = store.list;

export function analysisStoreErrorResponse(error: unknown): Response {
  if (error instanceof ArchiveValidationError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof AnalysisStoreError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "分析データの処理に失敗しました。もう一度お試しください。" }, { status: 500 });
}
