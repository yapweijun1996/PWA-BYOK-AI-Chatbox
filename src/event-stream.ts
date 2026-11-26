export async function parseEventStream(
  stream: ReadableStream<Uint8Array>,
  onData: (data: string, receivedAt: number) => void,
  onDone: () => void = () => {},
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedAt = performance.now();
  const consume = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data === "[DONE]") onDone();
    else if (data) onData(data, receivedAt);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      // Events in one read have the same observable arrival time.
      if (!done) receivedAt = performance.now();
      buffer += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) {
        if (buffer.trim()) consume(buffer);
        break;
      }
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

