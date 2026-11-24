import type { ReviewChange } from "@/lib/review-types";
import type { PullRequestInfo } from "@/lib/github-pr";

export type LlmTriageResult = {
  changes: ReviewChange[];
  filteredOutCount: number;
  summary?: string;
  usedLlm: true;
};

type TriageItem = {
  id?: string;
  keep?: boolean;
  kind?: ReviewChange["kind"];
  label?: string;
  description?: string;
};

const MAX_PATCH_CHARS = 16_000;
const MAX_FILE_PATCH_CHARS = 2_500;
const DEFAULT_MODEL = "gpt-5.6-luna";

function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^[`'"]+|[`'"]+$/g, "").trim();
}

function buildPrPayload(pr: PullRequestInfo) {
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

/**
 * Use an LLM to analyze the PR diff (when present) and DOM diff candidates so
 * only meaningful visual UI changes (copy, layout, images) are kept, while
 * formatting/lint churn and dynamic carousel noise are dropped.
 *
 * Returns null if OPENAI_API_KEY is not configured or the request fails so the
 * caller can fall back to deterministic heuristics.
 */
export async function triageChangesWithLlm(
  changes: ReviewChange[],
  pr?: PullRequestInfo | null,
  opts?: {
    apiKey?: string;
    model?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<LlmTriageResult | null> {
  const key = cleanEnv(opts?.apiKey ?? process.env.OPENAI_API_KEY);
  if (!key || changes.length === 0) return null;

  const model = cleanEnv(opts?.model ?? process.env.OPENAI_MODEL) || DEFAULT_MODEL;
  const fetchFn = opts?.fetchImpl ?? fetch;

  const candidates = changes.map((c) => ({
    id: c.id,
    kind: c.kind,
    before: String(c.before.text ?? c.before.imageSrc ?? "").slice(0, 300),
    after: String(c.after.text ?? c.after.imageSrc ?? "").slice(0, 300),
  }));

  const systemPrompt = [
    "You are Diffy, a visual PR reviewer for marketing web pages.",
    "First analyze the pull request diff (if provided) to understand what actually changed.",
    "Then decide for each DOM diff candidate whether it is a real user-visible UI change:",
    "- KEEP: genuine copy wording changes, new/changed UI layout sections, or changed/added images.",
    "- DROP: code formatting/linting/prettier churn, refactors with identical visible output, or dynamic/carousel noise unrelated to the PR.",
    "When a PR diff is provided, only keep candidates that plausibly correspond to the PR's real edits.",
    "Never invent candidate ids. Keep labels concise (<= 6 words) and descriptions to 1 short sentence.",
    'Return strict JSON: {"summary":"1 short sentence","items":[{"id":"chg_1","keep":true,"kind":"copy|image|layout","label":"...","description":"..."}]}',
  ].join("\n");

  const userPayload = pr
    ? { pr: buildPrPayload(pr), candidates }
    : { candidates };

  try {
    const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      summary?: string;
      items?: TriageItem[];
    };
    if (!Array.isArray(parsed.items)) return null;

    const byId = new Map<string, TriageItem>();
    for (const item of parsed.items) {
      if (typeof item.id === "string" && item.id) {
        byId.set(item.id, item);
      }
    }

    const kept: ReviewChange[] = [];
    for (const change of changes) {
      const decision = byId.get(change.id);
      if (!decision?.keep) continue;
      kept.push({
        ...change,
        kind:
          decision.kind === "copy" ||
          decision.kind === "image" ||
          decision.kind === "layout"
            ? decision.kind
            : change.kind,
        label: decision.label?.trim() || change.label,
        description: decision.description?.trim() || change.description,
        ...(pr ? { inPr: true } : {}),
      });
    }

    return {
      changes: kept,
      filteredOutCount: Math.max(0, changes.length - kept.length),
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : undefined,
      usedLlm: true,
    };
  } catch {
    return null;
  }
}
