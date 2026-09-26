import test from "node:test";
import assert from "node:assert/strict";
import { readJsonLines } from "../lib/stream";

test("NDJSON handles every UTF-8 byte boundary and a final line without newline", async () => {
  const bytes = new TextEncoder().encode('\n{"message":"日本語のコメント"}\n{"type":"complete"}');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events: unknown[] = [];
  await readJsonLines(stream, event => events.push(event));
  assert.deepEqual(events, [{ message: "日本語のコメント" }, { type: "complete" }]);
});

test("malformed streaming input surfaces an error and cancels the reader", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{invalid}\n')); }, cancel() { cancelled = true; } });
  await assert.rejects(readJsonLines(stream, () => {}), SyntaxError);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});
