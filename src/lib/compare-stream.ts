export type CompareStreamEvent = {
  step?: "pr" | "urls" | "claims" | "fetch" | "locate" | "done";
  status?: "start" | "done";
  previewUrl?: string;
  baseUrl?: string;
  runId?: string;
  changeCount?: number;
  unlocatedCount?: number;
  error?: string;
  needsBypass?: boolean;
};

export async function readCompareNdjson(
  res: Response,
  onEvent: (event: CompareStreamEvent) => void,
): Promise<CompareStreamEvent> {
  if (!res.body) {
    const data = (await res.json()) as CompareStreamEvent;
    onEvent(data);
    return data;
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("ndjson")) {
    const data = (await res.json()) as CompareStreamEvent;
    onEvent(data);
    return data;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let last: CompareStreamEvent = {};

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      last = JSON.parse(trimmed) as CompareStreamEvent;
      onEvent(last);
    }
  }

  const tail = buf.trim();
  if (tail) {
    last = JSON.parse(tail) as CompareStreamEvent;
    onEvent(last);
  }

  return last;
}
