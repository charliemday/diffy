import type { ReviewChange } from "@/lib/review-types";

/**
 * Optional polish of labels/descriptions. Never invents new changes.
 * Only runs when explicitly enabled by the caller AND OPENAI_API_KEY is set.
 * Sends truncated change text to OpenAI — never call without user opt-in.
 */
export async function polishChangeLabels(
  changes: ReviewChange[],
  enabled: boolean,
): Promise<ReviewChange[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!enabled || !key || changes.length === 0) return changes;

  try {
    const payload = changes.map((c) => ({
      id: c.id,
      kind: c.kind,
      before: String(c.before.text ?? c.before.imageSrc ?? "").slice(0, 200),
      after: String(c.after.text ?? c.after.imageSrc ?? "").slice(0, 200),
    }));

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You label marketing-site visual diffs. Return JSON {"items":[{"id","label","description","kind"}]} where kind is copy|image|layout. Keep labels short (≤6 words). Do not invent ids.',
          },
          {
            role: "user",
            content: JSON.stringify({ items: payload }),
          },
        ],
      }),
    });

    if (!res.ok) return changes;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return changes;
    const parsed = JSON.parse(raw) as {
      items?: {
        id: string;
        label?: string;
        description?: string;
        kind?: ReviewChange["kind"];
      }[];
    };
    if (!parsed.items?.length) return changes;

    const byId = new Map(parsed.items.map((i) => [i.id, i]));
    return changes.map((c) => {
      const polish = byId.get(c.id);
      if (!polish) return c;
      return {
        ...c,
        label: polish.label?.trim() || c.label,
        description: polish.description?.trim() || c.description,
        kind:
          polish.kind === "copy" ||
          polish.kind === "image" ||
          polish.kind === "layout"
            ? polish.kind
            : c.kind,
      };
    });
  } catch {
    return changes;
  }
}
