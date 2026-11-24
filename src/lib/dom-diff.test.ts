import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffDocuments } from "./dom-diff";
import {
  filterChangesToPullRequest,
  netPatchContentDeltas,
} from "./pr-filter-changes";
import type { PullRequestInfo } from "./github-pr";

describe("diffDocuments — meaningful visuals only", () => {
  it("reports real copy changes", () => {
    const before = `<html><body><h1>Gear built for the long trail.</h1></body></html>`;
    const after = `<html><body><h1>Pack light. Stay out longer.</h1></body></html>`;
    const { changes } = diffDocuments(before, after);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "copy");
    assert.match(changes[0].after.text ?? "", /Pack light/);
  });

  it("ignores whitespace / entity-only text churn", () => {
    const before = `<html><body><p>Hello&nbsp;world</p></body></html>`;
    const after = `<html><body><p>Hello world</p></body></html>`;
    const { changes } = diffDocuments(before, after);
    assert.equal(changes.length, 0);
  });

  it("ignores image cache-bust query differences", () => {
    const before = `<html><body><img src="/hero.png?v=1" alt="Hero" /></body></html>`;
    const after = `<html><body><img src="/hero.png?v=2" alt="Hero" /></body></html>`;
    const { changes } = diffDocuments(before, after);
    assert.equal(changes.length, 0);
  });

  it("reports real image path changes", () => {
    const before = `<html><body><img src="/hero-old.png" alt="Hero" /></body></html>`;
    const after = `<html><body><img src="/hero-new.png" alt="Hero" /></body></html>`;
    const { changes } = diffDocuments(before, after);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "image");
  });

  it("treats reformatted-but-same wording as not new layout", () => {
    const before = `<html><body><section><p>Ultralight kits for weekend ridge lines.</p></section></body></html>`;
    // Extra wrapper shifts nth-of-type paths, but wording is unchanged
    const after = `<html><body><div><section><p>Ultralight kits for weekend ridge lines.</p></section></div></body></html>`;
    const { changes } = diffDocuments(before, after);
    assert.equal(
      changes.filter((c) => c.kind === "layout").length,
      0,
      "moved identical copy must not become layout",
    );
  });

  it("reports genuinely new layout copy", () => {
    const before = `<html><body><h1>Northline</h1></body></html>`;
    const after = `<html><body><h1>Northline</h1><p>As seen in Outside Magazine this spring.</p></body></html>`;
    const { changes } = diffDocuments(before, after);
    assert.ok(changes.some((c) => c.kind === "layout"));
  });
});

describe("netPatchContentDeltas — prettier / lint noise", () => {
  it("cancels formatting-only hunks so UI strings are not net deltas", () => {
    const patch = `@@ -1,3 +1,5 @@
-      <h1>Pack light. Stay out longer.</h1>
+    <h1>
+      Pack light. Stay out longer.
+    </h1>
`;
    const { added, removed } = netPatchContentDeltas(patch);
    assert.deepEqual(added, []);
    assert.deepEqual(removed, []);
  });

  it("keeps real copy rewrites as net deltas", () => {
    const patch = `@@ -1,1 +1,1 @@
-      <h1>Gear built for the long trail.</h1>
+      <h1>Pack light. Stay out longer.</h1>
`;
    const { added, removed } = netPatchContentDeltas(patch);
    assert.ok(added.some((l) => l.includes("pack light")));
    assert.ok(removed.some((l) => l.includes("gear built")));
  });
});

describe("filterChangesToPullRequest", () => {
  const basePr = (patch: string): PullRequestInfo => ({
    url: "https://github.com/acme/site/pull/1",
    owner: "acme",
    repo: "site",
    number: 1,
    title: "chore: format",
    state: "open",
    headRef: "chore/format",
    baseRef: "main",
    files: [
      {
        filename: "src/components/Hero.tsx",
        status: "modified",
        additions: 3,
        deletions: 1,
        patch,
        basename: "Hero.tsx",
        webPaths: ["Hero.tsx", "/src/components/Hero.tsx"],
        isMedia: false,
      },
    ],
  });

  it("drops visual copy when the PR only reformatted the same string", () => {
    const formatOnly = `@@ -1,3 +1,5 @@
-      <h1>Pack light. Stay out longer.</h1>
+    <h1>
+      Pack light. Stay out longer.
+    </h1>
`;
    const changes = [
      {
        id: "chg_1",
        kind: "copy" as const,
        label: "Headline",
        description: "Text updated",
        selector: "chg_1",
        before: { text: "Pack light. Stay out longer." },
        after: { text: "Pack light. Stay out longer." },
      },
      {
        id: "chg_2",
        kind: "copy" as const,
        label: "Carousel",
        description: "Dynamic slide",
        selector: "chg_2",
        before: { text: "Slide A offer" },
        after: { text: "Slide B offer" },
      },
    ];
    const result = filterChangesToPullRequest(changes, basePr(formatOnly));
    assert.equal(result.matchedCount, 0);
    assert.equal(result.filteredOutCount, 2);
  });

  it("keeps copy that matches a real PR wording change", () => {
    const realCopy = `@@ -1,1 +1,1 @@
-  title: "Gear built for the long trail."
+  title: "Pack light. Stay out longer."
`;
    const changes = [
      {
        id: "chg_1",
        kind: "copy" as const,
        label: "Headline",
        description: "Text updated",
        selector: "chg_1",
        before: { text: "Gear built for the long trail." },
        after: { text: "Pack light. Stay out longer." },
      },
    ];
    const result = filterChangesToPullRequest(changes, basePr(realCopy));
    assert.equal(result.matchedCount, 1);
    assert.equal(result.changes[0].inPr, true);
  });
});
