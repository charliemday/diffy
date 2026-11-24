import { parse, type HTMLElement } from "node-html-parser";
import type { ReviewChange } from "@/lib/review-types";
import {
  collapseWhitespace,
  isTrivialImageChange,
  isTrivialTextChange,
  meaningfulText,
} from "@/lib/meaningful-text";

const MAX_CHANGES = 25;
const MIN_LAYOUT_TEXT = 12;
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
  path: string;
  src: string;
  alt: string;
  el: HTMLElement;
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
    // Skip non-content subtrees, but still descend from body/html roots
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
      path: nthOfTypePath(el),
      src,
      alt: el.getAttribute("alt")?.trim() ?? "",
      el,
    });
  }
  return out;
}

function truncate(s: string, n = 120): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

function labelForCopy(tag: string, text: string): string {
  const map: Record<string, string> = {
    h1: "Headline",
    h2: "Subheading",
    h3: "Subheading",
    p: "Body copy",
    a: "Link text",
    button: "Button",
    li: "List item",
    span: "Text",
  };
  const base = map[tag] ?? `${tag.toUpperCase()} text`;
  return `${base}: “${truncate(text, 40)}”`;
}

function isAncestorPath(ancestor: string, descendant: string): boolean {
  return descendant.startsWith(`${ancestor}>`);
}

export type DiffResult = {
  changes: ReviewChange[];
  afterHtml: string;
  pageTitle?: string;
};

function absolutizeUrl(value: string, pageUrl?: string): string {
  if (!pageUrl || !value || value.startsWith("data:")) return value;
  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return value;
  }
}

/**
 * Deterministic DOM diff focused on meaningful marketing visuals:
 * copy wording, new UI blocks, and image asset changes.
 * Mutates the after document by setting data-diffy-id on matched elements.
 */
export function diffDocuments(
  beforeHtml: string,
  afterHtml: string,
  opts?: { beforeUrl?: string; afterUrl?: string },
): DiffResult {
  const beforeDoc = parse(beforeHtml, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });
  const afterDoc = parse(afterHtml, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });

  const beforeRoot =
    (beforeDoc.querySelector("body") as HTMLElement | null) ?? beforeDoc;
  const afterRoot =
    (afterDoc.querySelector("body") as HTMLElement | null) ?? afterDoc;

  const beforeTexts = collectTextSnaps(beforeRoot);
  const afterTexts = collectTextSnaps(afterRoot);
  const beforeByPath = new Map(beforeTexts.map((t) => [t.path, t]));
  const afterByPath = new Map(afterTexts.map((t) => [t.path, t]));

  const changes: ReviewChange[] = [];
  const usedAfterEls = new Set<HTMLElement>();
  const copyPaths: string[] = [];

  // Path-matched text changes — skip formatting-only / entity-only churn
  const pendingCopy: Array<{
    path: string;
    before: TextSnap;
    after: TextSnap;
  }> = [];

  for (const [path, after] of afterByPath) {
    const before = beforeByPath.get(path);
    if (!before) continue;
    if (before.text === after.text) continue;
    if (isTrivialTextChange(before.text, after.text)) continue;
    pendingCopy.push({ path, before, after });
  }

  // Prefer deepest (child) copy hits over parent wrappers that only changed
  // because a nested node changed.
  pendingCopy.sort((a, b) => b.path.length - a.path.length);
  for (const { path, before, after } of pendingCopy) {
    if (changes.length >= MAX_CHANGES) break;
    if (copyPaths.some((p) => isAncestorPath(path, p))) continue;
    const id = `chg_${changes.length + 1}`;
    after.el.setAttribute("data-diffy-id", id);
    usedAfterEls.add(after.el);
    copyPaths.push(path);
    changes.push({
      id,
      kind: "copy",
      label: labelForCopy(after.tag, after.text),
      description: `Text updated in <${after.tag}>.`,
      selector: id,
      before: { text: before.text },
      after: { text: after.text },
    });
  }

  // Added text blocks (layout) — only truly new wording, not moved/reformatted
  const beforeMeaningful = new Set(
    beforeTexts.map((t) => meaningfulText(t.text)).filter(Boolean),
  );
  for (const after of afterTexts) {
    if (changes.length >= MAX_CHANGES) break;
    if (usedAfterEls.has(after.el)) continue;
    if (beforeByPath.has(after.path)) continue;
    const key = meaningfulText(after.text);
    if (!key || beforeMeaningful.has(key)) continue;
    if (after.text.length < MIN_LAYOUT_TEXT) continue;
    const id = `chg_${changes.length + 1}`;
    after.el.setAttribute("data-diffy-id", id);
    usedAfterEls.add(after.el);
    changes.push({
      id,
      kind: "layout",
      label: `Added: “${truncate(after.text, 40)}”`,
      description: `New <${after.tag}> content not present on the base page.`,
      selector: id,
      before: { text: "(section missing)" },
      after: { text: after.text },
    });
  }

  // Image src changes — ignore cache-busting query/hash-only differences
  const beforeImgs = collectImgs(beforeRoot);
  const afterImgs = collectImgs(afterRoot);
  const beforeImgByPath = new Map(beforeImgs.map((i) => [i.path, i]));

  for (const after of afterImgs) {
    if (changes.length >= MAX_CHANGES) break;
    if (usedAfterEls.has(after.el)) continue;
    const before = beforeImgByPath.get(after.path);
    if (!before) {
      const id = `chg_${changes.length + 1}`;
      after.el.setAttribute("data-diffy-id", id);
      usedAfterEls.add(after.el);
      changes.push({
        id,
        kind: "image",
        label: after.alt ? `New image: ${truncate(after.alt, 40)}` : "New image",
        description: "Image added on the preview page.",
        selector: id,
        before: { text: "(image missing)" },
        after: {
          imageSrc: absolutizeUrl(after.src, opts?.afterUrl),
          imageAlt: after.alt,
        },
      });
      continue;
    }
    if (isTrivialImageChange(before.src, after.src)) continue;
    const id = `chg_${changes.length + 1}`;
    after.el.setAttribute("data-diffy-id", id);
    usedAfterEls.add(after.el);
    changes.push({
      id,
      kind: "image",
      label: after.alt ? `Image: ${truncate(after.alt, 40)}` : "Image updated",
      description: "Image source changed between base and preview.",
      selector: id,
      before: {
        imageSrc: absolutizeUrl(before.src, opts?.beforeUrl),
        imageAlt: before.alt,
      },
      after: {
        imageSrc: absolutizeUrl(after.src, opts?.afterUrl),
        imageAlt: after.alt,
      },
    });
  }

  const title =
    afterDoc.querySelector("title")?.text?.trim() ||
    beforeDoc.querySelector("title")?.text?.trim() ||
    undefined;

  return {
    changes,
    afterHtml: afterDoc.toString(),
    pageTitle: title,
  };
}
