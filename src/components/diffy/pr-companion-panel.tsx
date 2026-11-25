"use client";

import { ExternalLink } from "lucide-react";
import type { PrCompanion } from "@/lib/review-types";
import { Button } from "@/components/ui/button";

export function PrCompanionPanel({ pr }: { pr: PrCompanion }) {
  const fileCount = pr.files.length;

  return (
    <div className="shrink-0 border-t border-[var(--diffy-line)] bg-[var(--diffy-surface)]/60 px-4 py-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--diffy-muted)]">
            PR companion
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-[var(--diffy-ink)]">
            #{pr.number} {pr.title}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--diffy-muted)]">
            {fileCount} file{fileCount === 1 ? "" : "s"}
            {pr.unlocatedCount > 0
              ? ` · ${pr.unlocatedCount} claim${pr.unlocatedCount === 1 ? "" : "s"} not on this page`
              : ""}
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <a href={pr.url} target="_blank" rel="noreferrer">
            View PR
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
