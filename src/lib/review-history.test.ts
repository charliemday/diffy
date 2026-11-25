import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureDiffyFocusStyles,
  parseReviewHistoryIndex,
  removeFromHistoryIndex,
  toHistoryEntry,
  upsertHistoryIndex,
} from "./review-history";
import type { ReviewRunPublic } from "./review-types";

const sampleRun: ReviewRunPublic = {
  id: "run_abc",
  createdAt: "2026-11-25T12:00:00.000Z",
  baseUrl: "https://www.example.com/about",
  previewUrl: "https://preview.example.com/about",
  pageUrl: "https://preview.example.com/about",
  pageTitle: "About",
  changes: [
    {
      id: "chg_1",
      kind: "layout",
      label: "Quest timeline",
      description: "Adds a timeline",
      selector: "chg_1",
      before: { text: "(section missing)" },
      after: { text: "Follow the quest..." },
    },
  ],
  status: "ready",
  pr: {
    url: "https://github.com/acme/site/pull/60",
    owner: "acme",
    repo: "site",
    number: 60,
    title: "Rebuild /about with quest timeline",
    headRef: "feat/about",
    baseRef: "main",
    files: [],
    unlocatedCount: 0,
  },
};

describe("toHistoryEntry", () => {
  it("builds a compact card from a public run", () => {
    const entry = toHistoryEntry(sampleRun, "2026-11-25T13:00:00.000Z");
    assert.equal(entry.id, "run_abc");
    assert.equal(entry.title, "Rebuild /about with quest timeline");
    assert.equal(entry.subtitle, "feat/about ← main");
    assert.equal(entry.changeCount, 1);
    assert.equal(entry.prNumber, 60);
    assert.equal(entry.savedAt, "2026-11-25T13:00:00.000Z");
  });
});

describe("review history index", () => {
  it("parses and upserts newest-first with a cap", () => {
    const a = toHistoryEntry({ ...sampleRun, id: "run_a" });
    const b = toHistoryEntry({ ...sampleRun, id: "run_b" });
    const c = toHistoryEntry({ ...sampleRun, id: "run_a", createdAt: "later" });
    const next = upsertHistoryIndex([a, b], c);
    assert.equal(next[0].id, "run_a");
    assert.equal(next.length, 2);
    assert.equal(next[1].id, "run_b");
  });

  it("round-trips JSON and removes entries", () => {
    const entry = toHistoryEntry(sampleRun);
    const parsed = parseReviewHistoryIndex(JSON.stringify([entry]));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, "run_abc");
    assert.equal(removeFromHistoryIndex(parsed, "run_abc").length, 0);
  });
});

describe("ensureDiffyFocusStyles", () => {
  it("injects focus CSS once into head", () => {
    const html = "<html><head></head><body><h1 data-diffy-id='x'>Hi</h1></body></html>";
    const once = ensureDiffyFocusStyles(html);
    assert.match(once, /data-diffy-injected="1"/);
    const twice = ensureDiffyFocusStyles(once);
    assert.equal(
      twice.split('data-diffy-injected="1"').length - 1,
      1,
    );
  });
});
