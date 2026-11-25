import type { PullRequestInfo } from "@/lib/github-pr";

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

const MAX_PATCH_CHARS = 16_000;
const MAX_FILE_PATCH_CHARS = 2_500;
const MAX_CLAIMS = 40;
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_PRETTY_RADAR_URL =
  "https://helicone-light.charliemday31.workers.dev";

function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^[`'"]+|[`'"]+$/g, "").trim();
}

export function buildPrPayload(pr: PullRequestInfo) {
  let budget = MAX_PATCH_CHARS;
  const files = pr.files.slice(0, 40).map((f) => {
    let patch: string | undefined;
    if (f.patch && budget > 0) {
      const slice = f.patch.slice(0, Math.min(MAX_FILE_PATCH_CHARS, budget));
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

  const systemPrompt = [
    "You are Diffy, a visual PR reviewer for marketing web pages.",
    "Read the pull request diff and list only user-visible visual changes:",
    "- copy: wording a visitor would read",
    "- image: added, replaced, or removed image assets",
    "- layout: new or removed UI sections",
    "Ignore lockfiles, dependency churn, formatting/lint/prettier, tests, CI, comments, and refactors whose visible output is unchanged.",
    "before/after must be exact visible strings or image filenames from the diff. Never invent copy.",
    "Keep labels concise (<= 6 words) and descriptions to 1 short sentence.",
    'Return strict JSON: {"summary":"1 short sentence","claims":[{"kind":"copy|image|layout","label":"...","description":"...","before":"...","after":"..."}]}',
    "If there are no user-visible changes, return {\"summary\":\"...\",\"claims\":[]}.",
  ].join("\n");

  const res = await fetchFn(completionsUrl, {
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
    signal: AbortSignal.timeout(15_000),
  });

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
