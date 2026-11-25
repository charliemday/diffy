import { parse, type HTMLElement } from "node-html-parser";
import type { ReviewChange } from "@/lib/review-types";
import type { VisualClaim } from "@/lib/pr-visual-claims";
import {
  collapseWhitespace,
  meaningfulImageSrc,
  meaningfulText,
} from "@/lib/meaningful-text";

const MIN_NEEDLE = 3;
const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "path",
  "meta",
  "link",
  "head",
  "html",
  "body",
]);

type TextSnap = {
  path: string;
  tag: string;
  text: string;
  el: HTMLElement;
};

type ImgSnap = {
  src: string;
  alt: string;
  el: HTMLElement;
};

export type LocateClaimsResult = {
  changes: ReviewChange[];
  afterHtml: string;
  pageTitle?: string;
  unlocatedCount: number;
};

function nthOfTypePath(el: HTMLElement): string {
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur.tagName && cur.tagName.toLowerCase() !== "html") {
    const tag = cur.tagName.toLowerCase();
    const parent = cur.parentNode as HTMLElement | null;
    if (!parent || !("childNodes" in parent)) {
      parts.unshift(tag);
      break;
    }
    const siblings = parent.childNodes.filter(
      (n) =>
        n.nodeType === 1 &&
        (n as HTMLElement).tagName?.toLowerCase() === tag,
    ) as HTMLElement[];
    const idx = Math.max(0, siblings.indexOf(cur)) + 1;
    parts.unshift(`${tag}:nth-of-type(${idx})`);
    cur = parent.tagName ? parent : null;
  }
  return parts.join(">");
}

function collectTextSnaps(root: HTMLElement): TextSnap[] {
  const out: TextSnap[] = [];
  const texty = new Set([
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "a",
    "button",
    "li",
    "label",
    "figcaption",
    "blockquote",
    "td",
    "th",
    "span",
    "strong",
    "em",
  ]);

  const walk = (el: HTMLElement, isRoot = false) => {
    const tag = el.tagName?.toLowerCase() ?? "";
    if (!isRoot && SKIP_TAGS.has(tag)) return;

    const kids = el.childNodes.filter((n) => n.nodeType === 1) as HTMLElement[];

    if (!isRoot && !SKIP_TAGS.has(tag)) {
      const ownText = collapseWhitespace(
        el.childNodes
          .filter((n) => n.nodeType === 3)
          .map((n) => n.text)
          .join(" "),
      );

      if (ownText && (texty.has(tag) || kids.length === 0)) {
        const full = collapseWhitespace(el.text);
        if (full && full.length <= 400) {
          out.push({
            path: nthOfTypePath(el),
            tag,
            text: full,
            el,
          });
        }
      }
    }

    for (const kid of kids) walk(kid, false);
  };
  walk(root, true);
  return out;
}

function collectImgs(root: HTMLElement): ImgSnap[] {
  const out: ImgSnap[] = [];
  for (const el of root.querySelectorAll("img")) {
    const src = el.getAttribute("src")?.trim() ?? "";
    if (!src || src.startsWith("data:")) continue;
    out.push({
      src,
      alt: el.getAttribute("alt")?.trim() ?? "",
      el,
    });
  }
  return out;
}

function textScore(haystack: string, needle: string): number | null {
  const n = meaningfulText(needle);
  if (n.length < MIN_NEEDLE) return null;
  const t = meaningfulText(haystack);
  if (!t) return null;
  if (t === n) return 2_000 - t.length;
  if (t.includes(n)) return 1_000 - t.length;
  if (n.includes(t) && t.length >= MIN_NEEDLE) return 200 - t.length;
  return null;
}

function findTextSnap(snaps: TextSnap[], needle: string | undefined): TextSnap | null {
  if (!needle) return null;
  let best: { snap: TextSnap; score: number } | null = null;
  for (const snap of snaps) {
    const score = textScore(snap.text, needle);
    if (score == null) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && snap.path.length > best.snap.path.length)
    ) {
      best = { snap, score };
    }
  }
  return best?.snap ?? null;
}

function imageMatches(src: string, needle: string): boolean {
  const path = meaningfulImageSrc(src);
  const n = meaningfulImageSrc(needle);
  if (!path || !n) return false;
  if (path === n || path.endsWith(n) || n.endsWith(path)) return true;
  const pathBase = path.split("/").pop() ?? path;
  const needleBase = n.split("/").pop() ?? n;
  if (pathBase === needleBase) return true;
  const stem = needleBase.replace(/\.[^.]+$/, "");
  return stem.length >= 3 && pathBase.startsWith(stem);
}

function findImgSnap(snaps: ImgSnap[], needle: string | undefined): ImgSnap | null {
  if (!needle) return null;
  return snaps.find((s) => imageMatches(s.src, needle)) ?? null;
}

function stampSelector(el: HTMLElement, fallback: string): string {
  const existing = el.getAttribute("data-diffy-id");
  if (existing) return existing;
  el.setAttribute("data-diffy-id", fallback);
  return fallback;
}

/** Semantic blocks that usually represent a whole UI section / list item. */
const LAYOUT_SECTION_TAGS = new Set([
  "section",
  "article",
  "li",
  "aside",
  "figure",
  "header",
  "footer",
  "nav",
  "main",
]);

/** Block wrappers we may climb into when there is no semantic section tag. */
const LAYOUT_BLOCK_TAGS = new Set([
  ...LAYOUT_SECTION_TAGS,
  "div",
  "ul",
  "ol",
  "dl",
  "table",
]);

const INLINE_TAGS = new Set([
  "span",
  "strong",
  "em",
  "b",
  "i",
  "small",
  "a",
  "time",
  "abbr",
  "mark",
  "code",
  "label",
]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * Layout claims describe whole new/removed sections, but text matching lands on
 * a heading or deep leaf. Climb to a section-sized container so the highlight
 * outlines the block, not just the title.
 */
export function expandToLayoutContainer(el: HTMLElement): HTMLElement {
  let cur: HTMLElement = el;
  let fallbackBlock: HTMLElement | null = null;
  let headingSiblingBlock: HTMLElement | null = null;

  // Always leave inline / phrasing leaves (e.g. <span>2022</span>).
  while (INLINE_TAGS.has(cur.tagName?.toLowerCase() ?? "")) {
    const parent = cur.parentNode as HTMLElement | null;
    if (!parent?.tagName) break;
    const pTag = parent.tagName.toLowerCase();
    if (pTag === "body" || pTag === "html") break;
    cur = parent;
  }

  const hitIsHeading = HEADING_TAGS.has(cur.tagName?.toLowerCase() ?? "");

  let walk: HTMLElement = cur;
  while (true) {
    const parent = walk.parentNode as HTMLElement | null;
    if (!parent?.tagName) break;
    const pTag = parent.tagName.toLowerCase();
    if (pTag === "body" || pTag === "html") break;

    if (LAYOUT_SECTION_TAGS.has(pTag)) {
      return parent;
    }

    if (LAYOUT_BLOCK_TAGS.has(pTag)) {
      const childEls = parent.childNodes.filter(
        (n) => n.nodeType === 1,
      ) as HTMLElement[];
      if (childEls.length >= 2) {
        const parentText = collapseWhitespace(parent.text);
        const hitText = collapseWhitespace(el.text);
        // Innermost wrapper that groups more than the matched leaf.
        if (
          !fallbackBlock &&
          (parentText.length > hitText.length + 24 ||
            parentText.length > hitText.length * 1.4)
        ) {
          fallbackBlock = parent;
        }

        // Heading + following siblings (timeline list, cards, etc.) — prefer
        // that wrapper even when there is no <section> tag.
        if (
          hitIsHeading &&
          !headingSiblingBlock &&
          childEls.some((child) => child !== walk && !HEADING_TAGS.has(child.tagName?.toLowerCase() ?? ""))
        ) {
          headingSiblingBlock = parent;
        }
      }
    }

    walk = parent;
  }

  return headingSiblingBlock ?? fallbackBlock ?? cur;
}

function absolutizeUrl(value: string, pageUrl?: string): string {
  if (!pageUrl || !value || value.startsWith("data:")) return value;
  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return value;
  }
}

function bodyRoot(html: string): { doc: ReturnType<typeof parse>; root: HTMLElement } {
  const doc = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });
  const root =
    (doc.querySelector("body") as HTMLElement | null) ?? (doc as unknown as HTMLElement);
  return { doc, root };
}

/**
 * Find PR visual claims in the preview HTML and stamp data-diffy-id for highlight.
 * Unlocated claims (other page, client-rendered shell, invented copy) are skipped.
 */
export function locateClaimsInHtml(
  claims: VisualClaim[],
  opts: {
    afterHtml: string;
    afterUrl?: string;
  },
): LocateClaimsResult {
  const { doc, root } = bodyRoot(opts.afterHtml);
  const texts = collectTextSnaps(root);
  const imgs = collectImgs(root);

  const changes: ReviewChange[] = [];
  let unlocatedCount = 0;

  for (const claim of claims) {
    if (claim.kind === "image") {
      const hit =
        findImgSnap(imgs, claim.after) ?? findImgSnap(imgs, claim.before);
      if (!hit) {
        unlocatedCount += 1;
        continue;
      }
      const id = `chg_${changes.length + 1}`;
      const selector = stampSelector(hit.el, id);
      changes.push({
        id,
        kind: "image",
        label: claim.label,
        description: claim.description,
        selector,
        before: claim.before
          ? {
              imageSrc: absolutizeUrl(claim.before, opts.afterUrl),
              imageAlt: hit.alt,
            }
          : { text: "(image missing)" },
        after: {
          imageSrc: absolutizeUrl(hit.src, opts.afterUrl),
          imageAlt: hit.alt,
        },
      });
      continue;
    }

    const hit =
      findTextSnap(texts, claim.after) ?? findTextSnap(texts, claim.before);
    if (!hit) {
      unlocatedCount += 1;
      continue;
    }
    const target =
      claim.kind === "layout" ? expandToLayoutContainer(hit.el) : hit.el;
    const id = `chg_${changes.length + 1}`;
    const selector = stampSelector(target, id);
    changes.push({
      id,
      kind: claim.kind,
      label: claim.label,
      description: claim.description,
      selector,
      before: { text: claim.before || "(section missing)" },
      after: {
        text:
          claim.after ||
          (claim.kind === "layout"
            ? collapseWhitespace(target.text).slice(0, 280)
            : hit.text),
      },
    });
  }

  const title = doc.querySelector("title")?.text?.trim() || undefined;

  return {
    changes,
    afterHtml: doc.toString(),
    pageTitle: title,
    unlocatedCount,
  };
}
