import type { ReviewChange } from "@/lib/review-types";
import type { PullRequestInfo, PrFileChange } from "@/lib/github-pr";

export type PrFilterResult = {
  changes: ReviewChange[];
  matchedCount: number;
  filteredOutCount: number;
};

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Extract added/removed line text from a unified diff patch (no +/- prefix). */
function patchLineTexts(patch: string | undefined): {
  added: string[];
  removed: string[];
} {
  const added: string[] = [];
  const removed: string[] = [];
  if (!patch) return { added, removed };
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+")) {
      const t = normalizeText(line.slice(1));
      if (t.length >= 2) added.push(t);
    } else if (line.startsWith("-")) {
      const t = normalizeText(line.slice(1));
      if (t.length >= 2) removed.push(t);
    }
  }
  return { added, removed };
}

function decodeUrlPath(url: string): string {
  try {
    const u = new URL(url, "https://diffy.local");
    return decodeURIComponent(u.pathname);
  } catch {
    try {
      return decodeURIComponent(url.split("?")[0] || url);
    } catch {
      return url;
    }
  }
}

function imageMatchesPr(src: string | undefined, files: PrFileChange[]): boolean {
  if (!src) return false;
  const path = decodeUrlPath(src).toLowerCase();
  const pathBase = path.split("/").pop() || path;

  for (const f of files) {
    if (!f.isMedia && !MEDIA_NAME_HINT.test(f.basename)) continue;
    const base = f.basename.toLowerCase();
    if (base && (pathBase === base || path.endsWith("/" + base))) {
      return true;
    }
    for (const wp of f.webPaths) {
      const w = wp.toLowerCase();
      if (w && (path === w || path.endsWith(w) || path.includes(w))) {
        return true;
      }
    }
    // hashed builds: hero-abc123.webp ↔ hero.webp
    if (base) {
      const stem = base.replace(/\.[^.]+$/, "");
      if (stem.length >= 3 && pathBase.startsWith(stem)) return true;
    }
  }
  return false;
}

const MEDIA_NAME_HINT = /\.(avif|bmp|gif|jpe?g|png|svg|webp|mp4|webm|mov|ico)$/i;

function textMatchesPr(
  before: string | undefined,
  after: string | undefined,
  files: PrFileChange[],
): boolean {
  const needles = [before, after]
    .map((t) => (t ? normalizeText(t) : ""))
    .filter((t) => t.length >= 3);

  if (needles.length === 0) return false;

  for (const f of files) {
    const { added, removed } = patchLineTexts(f.patch);
    const haystack = [...added, ...removed];
    for (const needle of needles) {
      for (const line of haystack) {
        if (line.includes(needle) || needle.includes(line)) {
          // Avoid ultra-short false positives
          if (Math.min(line.length, needle.length) >= 3) return true;
        }
      }
      // Filename / component name hint in label-less matching: skip
    }
  }
  return false;
}

function annotate(
  change: ReviewChange,
  reason: string,
): ReviewChange {
  return {
    ...change,
    description: `${change.description} · ${reason}`,
    inPr: true,
  };
}

/**
 * When a PR is linked, keep only visual changes that appear related to
 * files/patches in that PR — drops carousel / randomized content noise.
 */
export function filterChangesToPullRequest(
  changes: ReviewChange[],
  pr: PullRequestInfo,
): PrFilterResult {
  if (pr.files.length === 0) {
    return {
      changes: [],
      matchedCount: 0,
      filteredOutCount: changes.length,
    };
  }

  const kept: ReviewChange[] = [];

  for (const change of changes) {
    if (change.kind === "image") {
      const hit =
        imageMatchesPr(change.after.imageSrc, pr.files) ||
        imageMatchesPr(change.before.imageSrc, pr.files);
      if (hit) {
        kept.push(annotate(change, "matched a media file in the PR"));
      }
      continue;
    }

    // copy + layout: require text to appear in a PR patch
    const hit = textMatchesPr(change.before.text, change.after.text, pr.files);
    if (hit) {
      kept.push(annotate(change, "matched copy in the PR diff"));
    }
  }

  return {
    changes: kept,
    matchedCount: kept.length,
    filteredOutCount: Math.max(0, changes.length - kept.length),
  };
}
