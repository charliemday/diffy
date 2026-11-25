import type { PrFileChange, PullRequestInfo } from "@/lib/github-pr";

export type VisualClaim = {
  kind: "copy" | "image" | "layout";
  label: string;
  description: string;
  /** Old visible copy or image path from the PR, if any */
  before?: string;
  /** New visible copy or image path from the PR, if any */
  after?: string;
};

export type VisualClaimsResult = {
  summary?: string;
  claims: VisualClaim[];
};

/** Total patch characters sent to the model across all files. */
export const MAX_PATCH_CHARS = 40_000;
/** Soft cap per file; large patches keep head + tail so JSX returns survive. */
export const MAX_FILE_PATCH_CHARS = 6_000;
const MAX_CLAIMS = 40;
const MAX_PAYLOAD_FILES = 40;
const DEFAULT_MODEL = "gpt-5.6-luna";
/** Large marketing PRs + Pretty Radar hop often exceed 15s on gpt-5.6-luna. */
const DEFAULT_CLAIMS_TIMEOUT_MS = 90_000;
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_PRETTY_RADAR_URL =
  "https://helicone-light.charliemday31.workers.dev";

const PATCH_TRUNCATION_MARKER = "\n... [truncated] ...\n";

function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^[`'"]+|[`'"]+$/g, "").trim();
}

function basenameOf(filename: string): string {
  const parts = filename.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filename;
}

/**
 * Lockfiles, generated manifests/sitemaps, package.json, tests, and tooling
 * configs burn patch budget without helping visual claim extraction.
 */
export function isNoiseFile(filename: string): boolean {
  const name = filename.replace(/\\/g, "/");
  const base = basenameOf(name).toLowerCase();

  if (
    base === "package-lock.json" ||
    base === "npm-shrinkwrap.json" ||
    base === "yarn.lock" ||
    base === "pnpm-lock.yaml" ||
    base === "bun.lock" ||
    base === "bun.lockb" ||
    base === "composer.lock" ||
    base === "cargo.lock" ||
    base === "poetry.lock" ||
    base === "package.json" ||
    base === "robots.txt"
  ) {
    return true;
  }

  if (/sitemap[^/]*\.(xml|txt)$/i.test(base)) return true;
  if (/manifest[^/]*\.json$/i.test(base)) return true;
  if (/^tsconfig(\..+)?\.json$/i.test(base)) return true;
  if (/^eslint(\.|$)/i.test(base)) return true;
  if (/^prettier(\.|$)/i.test(base)) return true;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(base)) return true;
  if (/(^|\/)(__tests__|__mocks__|\.github|\.husky|\.vscode)\//i.test(name)) {
    return true;
  }
  if (/\.(yml|yaml)$/i.test(base) && /(^|\/)(\.github|ci|deploy)\//i.test(name)) {
    return true;
  }

  return false;
}

/**
 * Lower number = higher priority when allocating the shared patch budget.
 * Pages/components/content beat scripts, CSS, and leftover config.
 */
export function patchPriority(
  file: Pick<PrFileChange, "filename" | "isMedia">,
): number {
  const name = file.filename.replace(/\\/g, "/");
  const base = basenameOf(name).toLowerCase();

  if (file.isMedia) return 1;

  if (
    /(^|\/)(pages|app|components|views|screens)\//i.test(name) ||
    /\.(tsx|jsx)$/i.test(base)
  ) {
    return 0;
  }

  if (
    /(^|\/)(content|data|copy|locales?|i18n|messages|translations)\//i.test(
      name,
    ) ||
    /\.(mdx?|md)$/i.test(base)
  ) {
    return 0;
  }

  // Content/i18n JSON (not already filtered as noise manifests).
  if (/\.json$/i.test(base)) return 1;

  if (/\.css$/i.test(base)) return 2;

  return 3;
}

/**
 * Prefer the start (imports / added markers) and end (JSX return) of large
 * component patches so visible markup is not the first thing truncated.
 */
export function slicePatch(
  patch: string,
  maxChars: number,
): string {
  if (patch.length <= maxChars) return patch;
  if (maxChars <= PATCH_TRUNCATION_MARKER.length + 32) {
    return patch.slice(0, maxChars);
  }

  const usable = maxChars - PATCH_TRUNCATION_MARKER.length;
  const headLen = Math.floor(usable * 0.35);
  const tailLen = usable - headLen;
  return (
    patch.slice(0, headLen) +
    PATCH_TRUNCATION_MARKER +
    patch.slice(patch.length - tailLen)
  );
}

export function buildPrPayload(pr: PullRequestInfo) {
  const ranked = pr.files
    .filter((f) => !isNoiseFile(f.filename))
    .slice()
    .sort((a, b) => {
      const diff = patchPriority(a) - patchPriority(b);
      if (diff !== 0) return diff;
      return a.filename.localeCompare(b.filename);
    })
    .slice(0, MAX_PAYLOAD_FILES);

  let budget = MAX_PATCH_CHARS;
  const files = ranked.map((f) => {
    let patch: string | undefined;
    if (f.patch && budget > 0) {
      const allowance = Math.min(MAX_FILE_PATCH_CHARS, budget);
      const slice = slicePatch(f.patch, allowance);
      patch = slice;
      budget -= slice.length;
    }
    return {
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      isMedia: f.isMedia,
      ...(patch ? { patch } : {}),
    };
  });

  return {
    title: pr.title,
    headRef: pr.headRef,
    baseRef: pr.baseRef,
    files,
  };
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function claimsTimeoutMs(raw?: string): number {
  const parsed = Number.parseInt(
    cleanEnv(raw ?? process.env.DIFFY_CLAIMS_TIMEOUT_MS),
    10,
  );
  if (!Number.isFinite(parsed) || parsed < 5_000) {
    return DEFAULT_CLAIMS_TIMEOUT_MS;
  }
  return Math.min(parsed, 180_000);
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  const message = "message" in err ? String(err.message) : "";
  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /aborted|timeout/i.test(message)
  );
}

/** OpenAI-compatible chat completions URL. Pretty Radar when configured. */
export function openaiChatCompletionsUrl(opts?: {
  baseUrl?: string;
  radarUrl?: string;
  radarKey?: string;
}): string {
  const explicit = cleanEnv(opts?.baseUrl ?? process.env.OPENAI_BASE_URL);
  if (explicit) return joinUrl(explicit, "chat/completions");

  const radarKey = cleanEnv(
    opts?.radarKey ?? process.env.PRETTY_RADAR_API_KEY,
  );
  const radarUrl = cleanEnv(
    opts?.radarUrl ?? process.env.PRETTY_RADAR_URL,
  );
  if (radarKey || radarUrl) {
    const root = radarUrl || DEFAULT_PRETTY_RADAR_URL;
    return joinUrl(root, "v1/chat/completions");
  }

  return joinUrl(DEFAULT_OPENAI_BASE, "chat/completions");
}

function radarAuthHeaders(radarKey: string | undefined): Record<string, string> {
  if (!radarKey) return {};
  return {
    "Pretty-Radar-Auth": `Bearer ${radarKey}`,
    "Pretty-Radar-Property-Step": "extract-visual-claims",
    "Pretty-Radar-Property-Environment":
      process.env.NODE_ENV === "production" ? "production" : "development",
  };
}

function asKind(value: unknown): VisualClaim["kind"] | null {
  return value === "copy" || value === "image" || value === "layout"
    ? value
    : null;
}

function asTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeClaims(raw: unknown): VisualClaim[] {
  if (!Array.isArray(raw)) return [];
  const out: VisualClaim[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const kind = asKind(rec.kind);
    if (!kind) continue;
    const before = asTrimmed(rec.before);
    const after = asTrimmed(rec.after);
    if (!before && !after) continue;
    const label =
      asTrimmed(rec.label) ||
      (kind === "copy" ? "Copy change" : kind === "image" ? "Image change" : "Layout change");
    const description =
      asTrimmed(rec.description) || "Visual change from the pull request.";
    out.push({ kind, label, description, before, after });
    if (out.length >= MAX_CLAIMS) break;
  }
  return out;
}

/**
 * Ask the model what user-visible copy, images, and layout the PR changed.
 * Throws when OPENAI_API_KEY is missing or the request fails — there is no
 * DOM-diff fallback.
 */
export async function extractVisualClaims(
  pr: PullRequestInfo,
  opts?: {
    apiKey?: string;
    model?: string;
    fetchImpl?: typeof fetch;
    baseUrl?: string;
    radarUrl?: string;
    radarKey?: string;
  },
): Promise<VisualClaimsResult> {
  const key = cleanEnv(opts?.apiKey ?? process.env.OPENAI_API_KEY);
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is required to identify visual changes in the pull request",
    );
  }

  const model = cleanEnv(opts?.model ?? process.env.OPENAI_MODEL) || DEFAULT_MODEL;
  const fetchFn = opts?.fetchImpl ?? fetch;
  const radarKey = cleanEnv(opts?.radarKey ?? process.env.PRETTY_RADAR_API_KEY);
  const completionsUrl = openaiChatCompletionsUrl({
    baseUrl: opts?.baseUrl,
    radarUrl: opts?.radarUrl,
    radarKey,
  });
  const timeoutMs = claimsTimeoutMs();

  const systemPrompt = [
    "You are Diffy, a visual PR reviewer for marketing web pages.",
    "Read the pull request diff and list only user-visible visual changes:",
    "- copy: wording a visitor would read",
    "- image: added, replaced, or removed image assets",
    "- layout: new or removed UI sections (one claim per section, not per line inside it)",
    "Ignore lockfiles, dependency churn, formatting/lint/prettier, tests, CI, comments, and refactors whose visible output is unchanged.",
    "Emit one layout claim per distinct new UI section (timeline, grid, hero, founders, press strip, etc.) instead of collapsing several sections into a single page-level claim.",
    "before/after must be exact visible strings or image filenames from the diff. Never invent copy.",
    "For layout claims, prefer the section heading or another distinctive phrase from that section as after/before.",
    "Keep labels concise (<= 6 words) and descriptions to 1 short sentence.",
    'Return strict JSON: {"summary":"1 short sentence","claims":[{"kind":"copy|image|layout","label":"...","description":"...","before":"...","after":"..."}]}',
    "If there are no user-visible changes, return {\"summary\":\"...\",\"claims\":[]}.",
  ].join("\n");

  let res: Response;
  try {
    res = await fetchFn(completionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...radarAuthHeaders(radarKey),
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify({ pr: buildPrPayload(pr) }) },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `Visual claim extraction timed out after ${Math.round(timeoutMs / 1000)}s. Try again — large PRs can take longer through Pretty Radar.`,
      );
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Visual claim extraction failed (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("Visual claim extraction returned an empty response");
  }

  let parsed: { summary?: unknown; claims?: unknown };
  try {
    parsed = JSON.parse(raw) as { summary?: unknown; claims?: unknown };
  } catch {
    throw new Error("Visual claim extraction returned invalid JSON");
  }

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : undefined,
    claims: normalizeClaims(parsed.claims),
  };
}
