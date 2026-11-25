"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, GitBranch, Link2 } from "lucide-react";
import { DEMO_CHANGES, DEMO_PR, DEMO_PR_COMPANION } from "@/data/demo";
import type { ReviewChange, ReviewRunPublic } from "@/lib/review-types";
import { BeforeAfter } from "@/components/diffy/before-after";
import { ChangeTimeline } from "@/components/diffy/change-timeline";
import { PrCompanionPanel } from "@/components/diffy/pr-companion-panel";
import { SitePreview } from "@/components/diffy/site-preview";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Props =
  | { mode: "demo" }
  | { mode: "run"; run: ReviewRunPublic; afterHtml?: string };

export function ReviewWorkspace(props: Props) {
  const isDemo = props.mode === "demo";
  const changes: ReviewChange[] = isDemo
    ? DEMO_CHANGES
    : props.run.changes;
  const pr = isDemo ? DEMO_PR_COMPANION : props.run.pr;
  const title = isDemo
    ? DEMO_PR.title
    : pr?.title || props.run.pageTitle || "URL compare";
  const localHtml =
    props.mode === "run" && props.afterHtml ? props.afterHtml : null;
  const subtitle = isDemo ? (
    <span className="truncate font-mono">
      {DEMO_PR.branch} ← {DEMO_PR.base}
    </span>
  ) : pr ? (
    <span className="truncate font-mono text-[11px]">
      {pr.headRef || `PR #${pr.number}`} ← {pr.baseRef || "base"}
    </span>
  ) : (
    <span className="truncate font-mono text-[11px]">
      {props.run.previewUrl}
    </span>
  );

  const [activeId, setActiveId] = useState<string | null>(
    changes[0]?.id ?? null,
  );

  useEffect(() => {
    setActiveId(changes[0]?.id ?? null);
  }, [changes]);

  const activeIndex = useMemo(
    () => changes.findIndex((c) => c.id === activeId),
    [activeId, changes],
  );
  const activeChange = activeIndex >= 0 ? changes[activeIndex] : null;

  const go = useCallback(
    (delta: number) => {
      setActiveId((current) => {
        const idx = changes.findIndex((c) => c.id === current);
        if (idx < 0) return changes[0]?.id ?? null;
        const next = Math.min(changes.length - 1, Math.max(0, idx + delta));
        return changes[next].id;
      });
    },
    [changes],
  );

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

  const empty = changes.length === 0;

  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-[var(--diffy-bg)] text-[var(--diffy-ink)]">
      <header className="shrink-0 border-b border-[var(--diffy-line)] bg-[var(--diffy-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/"
              className="cursor-pointer font-[family-name:var(--font-display)] text-xl tracking-tight font-semibold shrink-0"
            >
              Diffy
            </Link>
            <Separator orientation="vertical" className="h-5 hidden sm:block" />
            <div className="min-w-0 hidden sm:block">
              <div className="truncate text-sm font-medium">{title}</div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--diffy-muted)]">
                {isDemo || pr ? (
                  <GitBranch className="size-3 shrink-0" />
                ) : (
                  <Link2 className="size-3 shrink-0" />
                )}
                {subtitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!empty && (
              <span className="hidden md:inline text-xs text-[var(--diffy-muted)] mr-1">
                {activeIndex + 1} / {changes.length}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => go(-1)}
              disabled={empty || activeIndex <= 0}
              aria-label="Previous change"
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => go(1)}
              disabled={empty || activeIndex >= changes.length - 1}
              aria-label="Next change"
            >
              <ArrowDown />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 min-h-0 flex-col lg:flex-row gap-4 p-4 sm:p-6 overflow-y-auto lg:overflow-hidden">
        <section className="flex-1 min-h-[48vh] lg:min-h-0">
          {isDemo ? (
            <SitePreview
              className="h-full min-h-[48vh] lg:min-h-0"
              activeSelector={activeChange?.selector ?? null}
              mode="demo"
            />
          ) : localHtml ? (
            <SitePreview
              className="h-full min-h-[48vh] lg:min-h-0"
              activeSelector={activeChange?.selector ?? null}
              mode="html"
              html={localHtml}
              pageLabel={props.run.previewUrl}
            />
          ) : (
            <SitePreview
              className="h-full min-h-[48vh] lg:min-h-0"
              activeSelector={activeChange?.selector ?? null}
              mode="iframe"
              runId={props.run.id}
              pageLabel={props.run.previewUrl}
            />
          )}
        </section>

        <aside className="lg:w-[380px] xl:w-[420px] shrink-0 flex flex-col min-h-[52vh] lg:min-h-0 lg:h-full rounded-xl border border-[var(--diffy-line)] bg-[var(--diffy-panel)] shadow-[0_18px_40px_-28px_rgba(20,40,30,0.4)] overflow-hidden">
          <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--diffy-line)]">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--diffy-muted)]">
              Change timeline
            </p>
            <p className="text-sm text-[var(--diffy-muted)] mt-0.5">
              {empty
                ? "No visual claims on this page"
                : `${changes.length} visual change${changes.length === 1 ? "" : "s"}`}
            </p>
          </div>

          <div className="flex-1 min-h-[140px] px-2 py-2 overflow-hidden">
            {empty ? (
              <div className="h-full flex items-center justify-center px-4 text-center text-sm text-[var(--diffy-muted)]">
                None of this PR’s visual claims were found on this page. They
                may live on another URL, or the preview is a client-rendered
                shell with no copy in the first HTML response.
              </div>
            ) : (
              <ChangeTimeline
                changes={changes}
                activeId={activeId}
                onSelect={setActiveId}
              />
            )}
          </div>

          <div className="shrink-0 max-h-[42%] overflow-y-auto border-t border-[var(--diffy-line)] bg-white/50 px-4 py-3">
            <BeforeAfter change={activeChange} />
          </div>

          {pr ? <PrCompanionPanel pr={pr} /> : null}
        </aside>
      </div>
    </div>
  );
}
