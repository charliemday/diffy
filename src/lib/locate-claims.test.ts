import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locateClaimsInHtml } from "./locate-claims";
import type { VisualClaim } from "./pr-visual-claims";

describe("locateClaimsInHtml", () => {
  it("highlights PR copy on the page and ignores carousel noise", () => {
    const after = `<html><body>
      <h1>Prompt to Perfection</h1>
      <p>Shubhra Motgill</p>
      <p>Gabriel Le Guen</p>
    </body></html>`;
    const claims: VisualClaim[] = [
      {
        kind: "copy",
        label: "Hero headline",
        description: "Rewrote the homepage headline.",
        before: "Grammarly For Prompts",
        after: "Prompt to Perfection",
      },
    ];
    const { changes, afterHtml, unlocatedCount } = locateClaimsInHtml(claims, {
      afterHtml: after,
    });
    assert.equal(changes.length, 1);
    assert.equal(unlocatedCount, 0);
    assert.equal(changes[0].kind, "copy");
    assert.equal(changes[0].after.text, "Prompt to Perfection");
    assert.match(afterHtml, /data-diffy-id="chg_1"/);
    assert.doesNotMatch(afterHtml, /data-diffy-id="chg_2"/);
  });

  it("counts claims that are not on this page as unlocated", () => {
    const after = `<html><body><h1>Unrelated page</h1></body></html>`;
    const claims: VisualClaim[] = [
      {
        kind: "copy",
        label: "Hero headline",
        description: "Rewrote the homepage headline.",
        before: "Grammarly For Prompts",
        after: "Prompt to Perfection",
      },
    ];
    const { changes, unlocatedCount } = locateClaimsInHtml(claims, {
      afterHtml: after,
    });
    assert.equal(changes.length, 0);
    assert.equal(unlocatedCount, 1);
  });

  it("locates image claims by filename", () => {
    const after = `<html><body><img src="/images/hero-new.png" alt="Hero" /></body></html>`;
    const claims: VisualClaim[] = [
      {
        kind: "image",
        label: "Hero image",
        description: "Swapped the hero photo.",
        before: "hero-old.png",
        after: "hero-new.png",
      },
    ];
    const { changes, unlocatedCount } = locateClaimsInHtml(claims, {
      afterHtml: after,
      afterUrl: "https://preview.example.com/",
    });
    assert.equal(unlocatedCount, 0);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "image");
    assert.match(changes[0].after.imageSrc ?? "", /hero-new\.png/);
  });
});
