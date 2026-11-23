"use client";

import { useEffect, useRef } from "react";
import { NorthlinePage } from "@/components/demo/northline-page";
import { cn } from "@/lib/utils";

export function SitePreview({
  activeSelector,
  className,
  mode = "demo",
  runId,
  pageLabel,
}: {
  activeSelector: string | null;
  className?: string;
  mode?: "demo" | "iframe";
  runId?: string;
  pageLabel?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (mode !== "demo") return;
    if (!activeSelector || !scrollerRef.current) return;
    const root = scrollerRef.current;
    const el = root.querySelector(
      `[data-diffy-id="${activeSelector}"]`,
    ) as HTMLElement | null;
    if (!el) return;

    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offset =
      elRect.top - rootRect.top + root.scrollTop - root.clientHeight * 0.28;

    root.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
  }, [activeSelector, mode]);

  useEffect(() => {
    if (mode !== "iframe") return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: "diffy:focus", selector: activeSelector },
      "*",
    );
  }, [activeSelector, mode]);

  const barLabel =
    pageLabel ?? (mode === "demo" ? "northline.co /" : "preview");

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--diffy-line)] bg-white shadow-[0_20px_50px_-30px_rgba(20,40,30,0.45)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--diffy-line)] bg-[#eef2ef] px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#e8a0a0]" />
        <span className="size-2.5 rounded-full bg-[#e6c98a]" />
        <span className="size-2.5 rounded-full bg-[#9dcca8]" />
        <div className="ml-2 flex-1 truncate rounded-md bg-white/80 px-3 py-1 text-[11px] text-[var(--diffy-muted)] font-mono">
          {barLabel}
        </div>
        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--diffy-muted)]">
          After
        </span>
      </div>
      {mode === "iframe" && runId ? (
        <iframe
          ref={iframeRef}
          title="Diffy site preview"
          src={`/api/proxy?runId=${encodeURIComponent(runId)}&side=after`}
          className="min-h-0 flex-1 w-full border-0 bg-white"
          onLoad={() => {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "diffy:focus", selector: activeSelector },
              "*",
            );
          }}
        />
      ) : (
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto">
          <NorthlinePage version="after" activeSelector={activeSelector} />
        </div>
      )}
    </div>
  );
}
