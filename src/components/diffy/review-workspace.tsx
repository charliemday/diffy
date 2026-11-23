"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, GitBranch } from "lucide-react";
import { DEMO_CHANGES, DEMO_PR } from "@/data/demo";
import { BeforeAfter } from "@/components/diffy/before-after";
import { ChangeTimeline } from "@/components/diffy/change-timeline";
import { SitePreview } from "@/components/diffy/site-preview";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function ReviewWorkspace() {
  const [activeId, setActiveId] = useState<string | null>(
    DEMO_CHANGES[0]?.id ?? null,
  );

  const activeIndex = useMemo(
    () => DEMO_CHANGES.findIndex((c) => c.id === activeId),
    [activeId],
  );
  const activeChange = activeIndex >= 0 ? DEMO_CHANGES[activeIndex] : null;

  const go = useCallback((delta: number) => {
    setActiveId((current) => {
      const idx = DEMO_CHANGES.findIndex((c) => c.id === current);
      if (idx < 0) return DEMO_CHANGES[0]?.id ?? null;
      const next = Math.min(
        DEMO_CHANGES.length - 1,
        Math.max(0, idx + delta),
      );
      return DEMO_CHANGES[next].id;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--diffy-bg)] text-[var(--diffy-ink)]">
      <header className="shrink-0 border-b border-[var(--diffy-line)] bg-[var(--diffy-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/"
              className="font-[family-name:var(--font-display)] text-xl tracking-tight font-semibold shrink-0"
            >
              Diffy
            </Link>
            <Separator orientation="vertical" className="h-5 hidden sm:block" />
            <div className="min-w-0 hidden sm:block">
              <div className="truncate text-sm font-medium">{DEMO_PR.title}</div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--diffy-muted)]">
                <GitBranch className="size-3" />
                <span className="truncate font-mono">
                  {DEMO_PR.branch} ← {DEMO_PR.base}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-xs text-[var(--diffy-muted)] mr-1">
              {activeIndex + 1} / {DEMO_CHANGES.length}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => go(-1)}
              disabled={activeIndex <= 0}
              aria-label="Previous change"
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => go(1)}
              disabled={activeIndex >= DEMO_CHANGES.length - 1}
              aria-label="Next change"
            >
              <ArrowDown />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 min-h-0 flex-col lg:flex-row gap-4 p-4 sm:p-6 lg:overflow-hidden">
        <section className="flex-1 min-h-[48vh] lg:min-h-0 lg:h-[calc(100dvh-5.5rem)]">
          <SitePreview
            className="h-full"
            activeSelector={activeChange?.selector ?? null}
          />
        </section>

        <aside className="lg:w-[380px] xl:w-[420px] shrink-0 flex flex-col min-h-[52vh] lg:h-[calc(100dvh-5.5rem)] lg:min-h-0 rounded-xl border border-[var(--diffy-line)] bg-[var(--diffy-panel)] shadow-[0_18px_40px_-28px_rgba(20,40,30,0.4)] overflow-hidden">
          <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--diffy-line)]">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--diffy-muted)]">
                  Change timeline
                </p>
                <p className="text-sm text-[var(--diffy-muted)] mt-0.5">
                  {DEMO_CHANGES.length} visual changes in this PR
                </p>
              </div>
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-[var(--diffy-line)] bg-white px-2 py-1 text-[10px] text-[var(--diffy-muted)] font-mono">
                ↑ ↓
              </kbd>
            </div>
          </div>

          <div className="flex-1 min-h-[140px] px-2 py-2 overflow-hidden">
            <ChangeTimeline
              changes={DEMO_CHANGES}
              activeId={activeId}
              onSelect={setActiveId}
            />
          </div>

          <div className="shrink-0 max-h-[42%] overflow-y-auto border-t border-[var(--diffy-line)] bg-white/50 px-4 py-3">
            <BeforeAfter change={activeChange} />
          </div>
        </aside>
      </div>
    </div>
  );
}
