"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, FileImage, FileCode2 } from "lucide-react";
import type { PrCompanion } from "@/lib/review-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function PrCompanionPanel({ pr }: { pr: PrCompanion }) {
  const [open, setOpen] = useState(false);
  const media = pr.files.filter((f) => f.isMedia);
  const code = pr.files.filter((f) => !f.isMedia);
  const fileCount = pr.files.length;
  const panelId = `pr-companion-${pr.number}`;

  return (
    <div className="shrink-0 border-t border-[var(--diffy-line)] bg-[var(--diffy-surface)]/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-start justify-between gap-2 px-4 py-3 text-left hover:bg-white/40 transition-colors"
      >
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
        <ChevronDown
          className={cn(
            "size-4 shrink-0 mt-1 text-[var(--diffy-muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div id={panelId} className="border-t border-[var(--diffy-line)]">
          <div className="px-4 pt-3 pb-2">
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="flex cursor-pointer items-center gap-1 text-sm font-medium text-[var(--diffy-ink)] hover:text-[var(--diffy-accent)] truncate"
            >
              <span className="truncate">
                #{pr.number} {pr.title}
              </span>
              <ExternalLink className="size-3 shrink-0 opacity-60" />
            </a>
            <p className="mt-0.5 text-[11px] font-mono text-[var(--diffy-muted)] truncate">
              {pr.headRef || "head"} ← {pr.baseRef || "base"}
            </p>
            {pr.unlocatedCount > 0 && (
              <p className="mt-2 rounded-md border border-[var(--diffy-line)] bg-white/70 px-2.5 py-1.5 text-[11px] text-[var(--diffy-muted)]">
                {pr.unlocatedCount} PR visual claim
                {pr.unlocatedCount === 1 ? "" : "s"} not found on this page.
              </p>
            )}
          </div>

          <ScrollArea className="max-h-36 px-2 pb-2">
            <ul className="space-y-0.5 pr-2">
              {[...media, ...code].map((f) => (
                <li
                  key={f.filename}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px]"
                >
                  {f.isMedia ? (
                    <FileImage className="size-3.5 mt-0.5 shrink-0 text-amber-700" />
                  ) : (
                    <FileCode2 className="size-3.5 mt-0.5 shrink-0 text-[var(--diffy-muted)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono truncate text-[var(--diffy-ink)]">
                      {f.filename}
                    </div>
                    <div className="text-[var(--diffy-muted)]">
                      <span className="capitalize">{f.status}</span>
                      <span
                        className={cn(
                          "ml-2",
                          f.additions > 0 && "text-emerald-700",
                        )}
                      >
                        +{f.additions}
                      </span>
                      <span
                        className={cn(
                          "ml-1",
                          f.deletions > 0 && "text-rose-700",
                        )}
                      >
                        −{f.deletions}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
              {pr.files.length === 0 && (
                <li className="px-2 py-2 text-[11px] text-[var(--diffy-muted)]">
                  No files listed on this pull request.
                </li>
              )}
            </ul>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
