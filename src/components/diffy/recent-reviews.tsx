"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, Trash2 } from "lucide-react";
import {
  deleteReviewSnapshot,
  listReviewHistory,
  type ReviewHistoryEntry,
} from "@/lib/review-history";
import { Button } from "@/components/ui/button";

function formatWhen(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

export function RecentReviews() {
  const [entries, setEntries] = useState<ReviewHistoryEntry[]>([]);

  useEffect(() => {
    setEntries(listReviewHistory());
  }, []);

  async function onRemove(id: string) {
    await deleteReviewSnapshot(id);
    setEntries(listReviewHistory());
  }

  if (entries.length === 0) return null;

  return (
    <section className="mt-10 rounded-2xl border border-[var(--diffy-line)] bg-white/70 p-5 sm:p-6 shadow-[0_18px_40px_-32px_rgba(20,40,30,0.45)]">
      <div className="flex items-center gap-2">
        <History className="size-4 text-[var(--diffy-accent)]" />
        <h2 className="text-sm font-medium text-[var(--diffy-ink)]">
          Recent reviews
        </h2>
      </div>
      <p className="mt-1 text-xs text-[var(--diffy-muted)]">
        Saved in this browser only — reopen anytime without a database.
      </p>
      <ul className="mt-4 divide-y divide-[var(--diffy-line)]">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/review/${encodeURIComponent(entry.id)}`}
                className="cursor-pointer block truncate text-sm font-medium text-[var(--diffy-ink)] hover:text-[var(--diffy-accent)]"
              >
                {entry.prNumber ? `#${entry.prNumber} ` : ""}
                {entry.title}
              </Link>
              <p className="mt-0.5 truncate text-[11px] font-mono text-[var(--diffy-muted)]">
                {entry.subtitle}
              </p>
              <p className="mt-1 text-[11px] text-[var(--diffy-muted)]">
                {entry.changeCount} change
                {entry.changeCount === 1 ? "" : "s"}
                {formatWhen(entry.savedAt) ? ` · ${formatWhen(entry.savedAt)}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-[var(--diffy-muted)]"
              aria-label={`Remove ${entry.title} from recent reviews`}
              onClick={() => void onRemove(entry.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
