import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPrPayload,
  extractVisualClaims,
  openaiChatCompletionsUrl,
} from "./pr-visual-claims";
import type { PullRequestInfo } from "./github-pr";

const samplePr: PullRequestInfo = {
  url: "https://github.com/acme/site/pull/7",
  owner: "acme",
  repo: "site",
  number: 7,
  title: "Update hero headline",
  state: "open",
  headRef: "feat/headline",
  headSha: "abc123def456",
  baseRef: "main",
  files: [
    {
      filename: "src/Hero.tsx",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch:
        "@@ -1 +1 @@\n-<h1>Grammarly For Prompts</h1>\n+<h1>Prompt to Perfection</h1>",
      basename: "Hero.tsx",
      webPaths: ["Hero.tsx"],
      isMedia: false,
    },
    {
      filename: "package-lock.json",
      status: "modified",
      additions: 0,
      deletions: 20,
      patch: "@@ -1 +1 @@\n-    \"proxy-agent-negotiate\": {\n",
      basename: "package-lock.json",
      webPaths: ["package-lock.json"],
      isMedia: false,
    },
  ],
};

describe("buildPrPayload", () => {
  it("includes truncated patches for the LLM", () => {
    const payload = buildPrPayload(samplePr);
    assert.equal(payload.title, "Update hero headline");
    assert.equal(payload.files.length, 2);
    assert.ok(payload.files[0].patch?.includes("Prompt to Perfection"));
  });
});

describe("openaiChatCompletionsUrl", () => {
  it("uses OPENAI_BASE_URL when set", () => {
    assert.equal(
      openaiChatCompletionsUrl({ baseUrl: "https://helicone-light.example/v1" }),
      "https://helicone-light.example/v1/chat/completions",
    );
  });

  it("routes through Pretty Radar when a radar key is present", () => {
    assert.equal(
      openaiChatCompletionsUrl({
        radarKey: "radar-test",
        radarUrl: "https://helicone-light.example",
      }),
      "https://helicone-light.example/v1/chat/completions",
    );
  });
});

describe("extractVisualClaims", () => {
  it("throws when API key is missing", async () => {
    await assert.rejects(
      () => extractVisualClaims(samplePr, { apiKey: "" }),
      /OPENAI_API_KEY/,
    );
  });

  it("returns claims from the model and drops junk entries", async () => {
    const fakeFetch: typeof fetch = async (input, init) => {
      assert.match(String(input), /chat\/completions/);
      const body = JSON.parse(String(init?.body)) as {
        messages: { content: string }[];
      };
      assert.match(body.messages[1].content, /Prompt to Perfection/);
      assert.doesNotMatch(body.messages[1].content, /candidates/);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Hero headline copy changed.",
                  claims: [
                    {
                      kind: "copy",
                      label: "Hero headline",
                      description: "Rewrote the homepage headline.",
                      before: "Grammarly For Prompts",
                      after: "Prompt to Perfection",
                    },
                    { kind: "copy", label: "Empty", description: "No strings" },
                    {
                      kind: "secret",
                      label: "Nope",
                      after: "should be ignored",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const res = await extractVisualClaims(samplePr, {
      apiKey: "sk-test",
      fetchImpl: fakeFetch,
      baseUrl: "https://api.openai.com/v1",
    });
    assert.equal(res.claims.length, 1);
    assert.equal(res.claims[0].after, "Prompt to Perfection");
    assert.equal(res.summary, "Hero headline copy changed.");
  });

  it("throws when the API call fails", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("rate limited", { status: 429 });

    await assert.rejects(
      () =>
        extractVisualClaims(samplePr, {
          apiKey: "sk-test",
          fetchImpl: fakeFetch,
        }),
      /429/,
    );
  });
});
