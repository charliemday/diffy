import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandToLayoutContainer,
  locateClaimsInHtml,
} from "./locate-claims";
import type { VisualClaim } from "./pr-visual-claims";
import { parse, type HTMLElement } from "node-html-parser";

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

  it("expands layout claims to the section, not the first text leaf", () => {
    const after = `<html><body>
      <section class="quest">
        <h2>Follow the quest...</h2>
        <article class="entry">
          <h3><span>2022</span> · <strong>Antler</strong></h3>
          <p>We meet at Antler in London (but we didn't found our startup during the programme!)</p>
        </article>
        <article class="entry">
          <h3>JANUARY 2024 · <strong>Dolphin AI</strong></h3>
          <p>We finally started a company together.</p>
        </article>
      </section>
    </body></html>`;
    const claims: VisualClaim[] = [
      {
        kind: "layout",
        label: "Quest timeline",
        description: "Added the company timeline section.",
        after: "2022",
      },
    ];
    const { changes, afterHtml, unlocatedCount } = locateClaimsInHtml(claims, {
      afterHtml: after,
    });
    assert.equal(unlocatedCount, 0);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "layout");
    // Stamp the section (or its article), never the bare "2022" span.
    assert.match(
      afterHtml,
      /<(section|article)[^>]*data-diffy-id="chg_1"/,
    );
    assert.doesNotMatch(
      afterHtml,
      /<span[^>]*data-diffy-id="chg_1"[^>]*>2022<\/span>/,
    );
  });

  it("expands layout claims matched on the section heading to the whole block", () => {
    const after = `<html><body>
      <section class="quest">
        <h2>Follow the quest...</h2>
        <ol>
          <li>
            <h3>2022 · Antler</h3>
            <p>We meet at Antler in London.</p>
          </li>
          <li>
            <h3>JANUARY 2024 · Dolphin AI</h3>
            <p>We finally started a company together.</p>
          </li>
        </ol>
      </section>
    </body></html>`;
    const claims: VisualClaim[] = [
      {
        kind: "layout",
        label: "Quest timeline",
        description: "Adds a milestone timeline to the About page.",
        after: "Follow the quest...",
      },
    ];
    const { afterHtml, unlocatedCount } = locateClaimsInHtml(claims, {
      afterHtml: after,
    });
    assert.equal(unlocatedCount, 0);
    assert.match(afterHtml, /<section[^>]*data-diffy-id="chg_1"/);
    assert.doesNotMatch(
      afterHtml,
      /<h2[^>]*data-diffy-id="chg_1"[^>]*>Follow the quest/,
    );
  });

  it("expands heading matches into a div that wraps the timeline list", () => {
    const after = `<html><body>
      <div class="quest-rail">
        <h2>Follow the quest...</h2>
        <ol>
          <li>2022 · Antler</li>
          <li>January 2024 · Dolphin AI</li>
        </ol>
      </div>
    </body></html>`;
    const claims: VisualClaim[] = [
      {
        kind: "layout",
        label: "Quest timeline",
        description: "Adds a milestone timeline.",
        after: "Follow the quest...",
      },
    ];
    const { afterHtml } = locateClaimsInHtml(claims, { afterHtml: after });
    assert.match(
      afterHtml,
      /<div class="quest-rail"[^>]*data-diffy-id="chg_1"/,
    );
    assert.doesNotMatch(
      afterHtml,
      /<h2[^>]*data-diffy-id="chg_1"/,
    );
  });

  it("keeps copy claims on the matched text leaf", () => {
    const after = `<html><body>
      <section>
        <h2>Follow the quest...</h2>
        <p><span>2022</span> launch</p>
      </section>
    </body></html>`;
    const claims: VisualClaim[] = [
      {
        kind: "copy",
        label: "Year label",
        description: "Updated the year.",
        before: "2021",
        after: "2022",
      },
    ];
    const { afterHtml } = locateClaimsInHtml(claims, { afterHtml: after });
    assert.match(afterHtml, /<span[^>]*data-diffy-id="chg_1"[^>]*>2022<\/span>/);
  });
});

describe("expandToLayoutContainer", () => {
  it("climbs from a heading to its wrapping section", () => {
    const doc = parse(`<section><h2 id="t">Follow the quest...</h2><ol><li>a</li></ol></section>`);
    const h2 = doc.querySelector("#t") as HTMLElement;
    const expanded = expandToLayoutContainer(h2);
    assert.equal(expanded.tagName.toLowerCase(), "section");
  });
});
