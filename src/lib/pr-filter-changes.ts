import type { ReviewChange } from "@/lib/review-types";
import type { PullRequestInfo, PrFileChange } from "@/lib/github-pr";
import { meaningfulText } from "@/lib/meaningful-text";

export type PrFilterResult = {
  changes: ReviewChange[];
  matchedCount: number;
  filteredOutCount: number;
};

const MEDIA_NAME_HINT = /\.(avif|bmp|gif|jpe?g|png|svg|webp|mp4|webm|mov|ico)$/i;
/** Ignore ultra-short tokens that appear in every prettier churn hunk. */
const MIN_DELTA_LEN = 3;

/**
 * Build multiset difference: values in `left` not cancelled by `right`.
 */
function multisetMinus(left: string[], right: string[]): string[] {
  const remaining = new Map<string, number>();
  for (const r of right) {
    remaining.set(r, (remaining.get(r) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const item of left) {
    const n = remaining.get(item) ?? 0;
    if (n > 0) {
      remaining.set(item, n - 1);
      continue;
    }
    out.push(item);
  }
  return out;
}

/**
 * Pull human-readable copy tokens out of a source line so prettier wrapping
 * (`<h1>Hi</h1>` → multi-line JSX) cancels against the same words.
 */
function contentTokensFromLine(rawLine: string): string[] {
  const line = rawLine.replace(/^\s+/, "");
  const tokens: string[] = [];

  const quoteRe = /(['"`])((?:\\.|(?!\1).){3,}?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRe.exec(line)) !== null) {
    const q = meaningfulText(m[2]);
    if (q.length >= MIN_DELTA_LEN) tokens.push(q);
  }

  // Strip tags / common JSX punctuation, keep visible words
  const stripped = meaningfulText(
    line
      .replace(/<[^>]+>/g, " ")
      .replace(/[{}();=<>/\\]/g, " ")
      .replace(/['"`]/g, " "),
  );
  if (stripped.length >= MIN_DELTA_LEN) tokens.push(stripped);

  return tokens;
}

/**
 * Extract *net* content deltas from a unified diff.
 * Formatting-only hunks (prettier / eslint --fix) cancel out after
 * content-token normalization, so unchanged UI strings don't keep false matches.
 */
export function netPatchContentDeltas(patch: string | undefined): {
  added: string[];
  removed: string[];
} {
  const addedTokens: string[] = [];
  const removedTokens: string[] = [];
  if (!patch) return { added: addedTokens, removed: removedTokens };

  for (const line of patch.split("\n")) {
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("@@")
    ) {
      continue;
    }
    if (line.startsWith("+")) {
      addedTokens.push(...contentTokensFromLine(line.slice(1)));
    } else if (line.startsWith("-")) {
      removedTokens.push(...contentTokensFromLine(line.slice(1)));
    }
  }

  // Cancel identical content tokens (indent / wrap / quote-style churn)
  const added = [...new Set(multisetMinus(addedTokens, removedTokens))];
  const removed = [...new Set(multisetMinus(removedTokens, addedTokens))];
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

function textMatchesPrDeltas(
  before: string | undefined,
  after: string | undefined,
  files: PrFileChange[],
): boolean {
  const needles = [before, after]
    .map((t) => (t ? meaningfulText(t) : ""))
    .filter((t) => {
      if (t.length < MIN_DELTA_LEN) return false;
      // Placeholder used by layout "added" changes
      if (t === "(section missing)" || t === "(image missing)") return false;
      return true;
    });

  if (needles.length === 0) return false;

  for (const f of files) {
    const { added, removed } = netPatchContentDeltas(f.patch);
    const haystack = [...added, ...removed];
    if (haystack.length === 0) continue;

    for (const needle of needles) {
      for (const line of haystack) {
        if (line.includes(needle) || needle.includes(line)) {
          if (Math.min(line.length, needle.length) >= MIN_DELTA_LEN) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function annotate(change: ReviewChange, reason: string): ReviewChange {
  return {
    ...change,
    description: `${change.description} · ${reason}`,
    inPr: true,
  };
}

/**
 * When a PR is linked, keep only visual changes tied to *net* content in
 * that PR — formatting-only hunks and carousel noise are dropped.
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

    // copy + layout: require text to appear in a *net* PR content delta
    const hit = textMatchesPrDeltas(
      change.before.text,
      change.after.text,
      pr.files,
    );
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
