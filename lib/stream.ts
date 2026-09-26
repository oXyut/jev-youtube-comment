/** Read NDJSON without losing a split UTF-8 character or a final unterminated line. */
export async function readJsonLines<T>(stream: ReadableStream<Uint8Array>, onEvent: (event: T) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as T);
      if (done) {
        if (buffer.trim()) onEvent(JSON.parse(buffer) as T);
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
