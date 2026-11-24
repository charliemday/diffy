import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { triageChangesWithLlm } from "./llm-diff-triage";
import type { ReviewChange } from "./review-types";
import type { PullRequestInfo } from "./github-pr";

const sampleChanges: ReviewChange[] = [
  {
    id: "chg_1",
    kind: "copy",
    label: "Headline",
    description: "Text updated in <h1>.",
    selector: "chg_1",
    before: { text: "Old headline" },
    after: { text: "New spring headline" },
  },
  {
    id: "chg_2",
    kind: "copy",
    label: "Carousel",
    description: "Text updated in <p>.",
    selector: "chg_2",
    before: { text: "Slide 1" },
    after: { text: "Slide 2" },
  },
];

const samplePr: PullRequestInfo = {
  url: "https://github.com/acme/site/pull/7",
  owner: "acme",
  repo: "site",
  number: 7,
  title: "Update hero headline",
  state: "open",
  headRef: "feat/headline",
  baseRef: "main",
  files: [
    {
      filename: "src/Hero.tsx",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: "@@ -1 +1 @@\n-<h1>Old headline</h1>\n+<h1>New spring headline</h1>",
      basename: "Hero.tsx",
      webPaths: ["Hero.tsx"],
      isMedia: false,
    },
  ],
};

describe("triageChangesWithLlm", () => {
  it("returns null when API key is missing", async () => {
    const res = await triageChangesWithLlm(sampleChanges, samplePr, {
      apiKey: "",
    });
    assert.equal(res, null);
  });

  it("keeps LLM-approved changes, drops noise, and ignores invented ids", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Updated the hero headline.",
                  items: [
                    {
                      id: "chg_1",
                      keep: true,
                      kind: "copy",
                      label: "Hero headline updated",
                      description: "Switched hero headline to spring copy.",
                    },
                    {
                      id: "chg_2",
                      keep: false,
                      kind: "copy",
                      label: "Carousel",
                      description: "Dynamic noise",
                    },
                    {
                      id: "chg_999",
                      keep: true,
                      kind: "copy",
                      label: "Hallucinated",
                      description: "Should be ignored",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const res = await triageChangesWithLlm(sampleChanges, samplePr, {
      apiKey: "sk-test",
      fetchImpl: fakeFetch,
    });

    assert.ok(res);
    assert.equal(res.usedLlm, true);
    assert.equal(res.changes.length, 1);
    assert.equal(res.filteredOutCount, 1);
    assert.equal(res.changes[0].id, "chg_1");
    assert.equal(res.changes[0].selector, "chg_1");
    assert.equal(res.changes[0].label, "Hero headline updated");
    assert.equal(res.changes[0].inPr, true);
  });

  it("returns null when the API call fails", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("rate limited", { status: 429 });

    const res = await triageChangesWithLlm(sampleChanges, samplePr, {
      apiKey: "sk-test",
      fetchImpl: fakeFetch,
    });
    assert.equal(res, null);
  });
});
