import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPrPayload,
  claimsTimeoutMs,
  extractVisualClaims,
  isNoiseFile,
  MAX_FILE_PATCH_CHARS,
  openaiChatCompletionsUrl,
  patchPriority,
  slicePatch,
} from "./pr-visual-claims";
import type { PrFileChange, PullRequestInfo } from "./github-pr";

function file(
  partial: Partial<PrFileChange> & Pick<PrFileChange, "filename">,
): PrFileChange {
  const filename = partial.filename;
  const basename = filename.split("/").pop() || filename;
  return {
    status: "modified",
    additions: 1,
    deletions: 0,
    basename,
    webPaths: [basename],
    isMedia: false,
    ...partial,
    filename,
  };
}

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
    file({
      filename: "src/Hero.tsx",
      additions: 1,
      deletions: 1,
      patch:
        "@@ -1 +1 @@\n-<h1>Grammarly For Prompts</h1>\n+<h1>Prompt to Perfection</h1>",
    }),
    file({
      filename: "package-lock.json",
      additions: 0,
      deletions: 20,
      patch: "@@ -1 +1 @@\n-    \"proxy-agent-negotiate\": {\n",
    }),
  ],
};

describe("isNoiseFile", () => {
  it("flags lockfiles, manifests, sitemaps, and tooling", () => {
    assert.equal(isNoiseFile("package-lock.json"), true);
    assert.equal(isNoiseFile("yarn.lock"), true);
    assert.equal(isNoiseFile("pnpm-lock.yaml"), true);
    assert.equal(isNoiseFile("package.json"), true);
    assert.equal(isNoiseFile("public/docs/manifest.json"), true);
    assert.equal(isNoiseFile("routes-manifest.json"), true);
    assert.equal(isNoiseFile("public/sitemap.xml"), true);
    assert.equal(isNoiseFile("tsconfig.json"), true);
    assert.equal(isNoiseFile("src/Hero.test.tsx"), true);
    assert.equal(isNoiseFile(".github/workflows/ci.yml"), true);
  });

  it("keeps UI, content, and i18n JSON", () => {
    assert.equal(isNoiseFile("src/pages/About.tsx"), false);
    assert.equal(isNoiseFile("src/components/about/QuestTimeline.tsx"), false);
    assert.equal(isNoiseFile("src/content/about.ts"), false);
    assert.equal(isNoiseFile("locales/en.json"), false);
    assert.equal(isNoiseFile("src/messages/nav.json"), false);
  });
});

describe("patchPriority", () => {
  it("ranks pages and components ahead of scripts and css", () => {
    assert.ok(
      patchPriority(file({ filename: "src/pages/About.tsx" })) <
        patchPriority(file({ filename: "scripts/lib/marketing-routes.mjs" })),
    );
    assert.ok(
      patchPriority(file({ filename: "src/components/about/QuestTimeline.tsx" })) <
        patchPriority(file({ filename: "src/index.css" })),
    );
    assert.ok(
      patchPriority(file({ filename: "src/content/about.ts" })) <
        patchPriority(file({ filename: "src/lib/about-schema.ts" })),
    );
  });
});

describe("slicePatch", () => {
  it("keeps head and tail of oversized patches", () => {
    const head = "HEAD-" + "a".repeat(200);
    const mid = "MID-" + "b".repeat(4000);
    const tail = "TAIL-" + "c".repeat(200) + "<div className=\"quest-rail\">";
    const patch = `${head}${mid}${tail}`;
    const sliced = slicePatch(patch, 800);
    assert.ok(sliced.length <= 800);
    assert.match(sliced, /HEAD-/);
    assert.match(sliced, /\[truncated\]/);
    assert.match(sliced, /quest-rail/);
    assert.ok(sliced.length < patch.length);
  });

  it("returns short patches unchanged", () => {
    assert.equal(slicePatch("short", 100), "short");
  });
});

describe("buildPrPayload", () => {
  it("drops lockfiles and keeps UI patches", () => {
    const payload = buildPrPayload(samplePr);
    assert.equal(payload.title, "Update hero headline");
    assert.equal(payload.files.length, 1);
    assert.equal(payload.files[0].filename, "src/Hero.tsx");
    assert.ok(payload.files[0].patch?.includes("Prompt to Perfection"));
  });

  it("prioritizes About page components over generated manifests", () => {
    const aboutPr: PullRequestInfo = {
      ...samplePr,
      title: "Rebuild /about with quest timeline",
      files: [
        file({
          filename: "public/docs/manifest.json",
          patch: "+generatedAt noise ".repeat(200),
        }),
        file({
          filename: "public/sitemap.xml",
          patch: "+lastmod noise ".repeat(200),
        }),
        file({
          filename: "routes-manifest.json",
          patch: "+routes noise ".repeat(200),
        }),
        file({
          filename: "scripts/lib/marketing-routes.mjs",
          patch: "+route map ".repeat(200),
        }),
        file({
          filename: "src/components/about/QuestTimeline.tsx",
          status: "added",
          additions: 132,
          patch:
            "@@ -0,0 +1,132 @@\n+import { QUEST_MILESTONES } from \"@/content/about\";\n+" +
            "x".repeat(MAX_FILE_PATCH_CHARS) +
            "\n+  return (\n+    <div className=\"quest-rail\">\n+      {QUEST_MILESTONES.map((m) => (\n+        <li key={m.when}>{m.when} {m.title}</li>\n+      ))}\n+    </div>\n+  );\n+",
        }),
        file({
          filename: "src/pages/About.tsx",
          status: "added",
          additions: 175,
          patch:
            "@@ -0,0 +1,175 @@\n+import { QuestTimeline } from \"@/components/about/QuestTimeline\";\n+export default function About() {\n+  return (\n+    <main>\n+      <QuestTimeline />\n+      <h2>Featured in</h2>\n+    </main>\n+  );\n+}\n",
        }),
        file({
          filename: "src/content/about.ts",
          status: "added",
          additions: 145,
          patch:
            "@@ -0,0 +1,145 @@\n+export const QUEST_MILESTONES = [\n+  { when: \"2022\", title: \"Antler\", body: \"We meet at Antler\" },\n+];\n",
        }),
        file({
          filename: "package-lock.json",
          patch: "+lockfile ".repeat(500),
        }),
      ],
    };

    const payload = buildPrPayload(aboutPr);
    const names = payload.files.map((f) => f.filename);

    assert.ok(!names.includes("package-lock.json"));
    assert.ok(!names.includes("public/docs/manifest.json"));
    assert.ok(!names.includes("public/sitemap.xml"));
    assert.ok(!names.includes("routes-manifest.json"));
    assert.ok(names.includes("src/pages/About.tsx"));
    assert.ok(names.includes("src/components/about/QuestTimeline.tsx"));
    assert.ok(names.includes("src/content/about.ts"));

    const timeline = payload.files.find(
      (f) => f.filename === "src/components/about/QuestTimeline.tsx",
    );
    assert.ok(timeline?.patch?.includes("quest-rail"));
    assert.ok(timeline?.patch?.includes("QUEST_MILESTONES"));

    const aboutPage = payload.files.find(
      (f) => f.filename === "src/pages/About.tsx",
    );
    assert.ok(aboutPage?.patch?.includes("QuestTimeline"));

    // Components/pages come before leftover scripts when both are present.
    assert.ok(
      names.indexOf("src/pages/About.tsx") <
        names.indexOf("scripts/lib/marketing-routes.mjs"),
    );
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

describe("claimsTimeoutMs", () => {
  it("defaults to 90s and clamps invalid values", () => {
    assert.equal(claimsTimeoutMs(""), 90_000);
    assert.equal(claimsTimeoutMs("1000"), 90_000);
    assert.equal(claimsTimeoutMs("45000"), 45_000);
    assert.equal(claimsTimeoutMs("999999"), 180_000);
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
      assert.doesNotMatch(body.messages[1].content, /package-lock/);
      assert.doesNotMatch(body.messages[1].content, /candidates/);
      assert.match(body.messages[0].content, /one layout claim per distinct/);
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

  it("maps abort timeouts to a clear claims error", async () => {
    const fakeFetch: typeof fetch = async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };

    await assert.rejects(
      () =>
        extractVisualClaims(samplePr, {
          apiKey: "sk-test",
          fetchImpl: fakeFetch,
          baseUrl: "https://api.openai.com/v1",
        }),
      /timed out after \d+s/,
    );
  });
});
