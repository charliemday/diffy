import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readCompareNdjson } from "./compare-stream";

describe("readCompareNdjson", () => {
  it("replays streamed steps in order", async () => {
    const body = [
      '{"step":"claims","status":"start"}',
      '{"step":"claims","status":"done"}',
      '{"step":"done","runId":"run_1","changeCount":2}',
      "",
    ].join("\n");
    const res = new Response(body, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
    const seen: string[] = [];
    const last = await readCompareNdjson(res, (event) => {
      seen.push(`${event.step}:${event.status ?? event.runId}`);
    });
    assert.deepEqual(seen, [
      "claims:start",
      "claims:done",
      "done:run_1",
    ]);
    assert.equal(last.runId, "run_1");
  });

  it("parses JSON error bodies", async () => {
    const res = new Response(JSON.stringify({ error: "Invalid PR URL" }), {
      headers: { "Content-Type": "application/json" },
    });
    const last = await readCompareNdjson(res, () => {});
    assert.equal(last.error, "Invalid PR URL");
  });
});
