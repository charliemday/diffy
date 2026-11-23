"use client";

import Image from "next/image";
import type { DemoChange } from "@/data/demo";
import { cn } from "@/lib/utils";

function Panel({
  label,
  children,
  tone,
  className,
}: {
  label: string;
  children: React.ReactNode;
  tone: "before" | "after";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 min-w-0",
        tone === "before"
          ? "border-rose-200/80 bg-rose-50/50"
          : "border-teal-200/80 bg-teal-50/60",
        className,
      )}
    >
      <div
        className={cn(
          "text-[10px] uppercase tracking-[0.18em] font-medium",
          tone === "before" ? "text-rose-700/80" : "text-teal-800/80",
        )}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export function BeforeAfter({ change }: { change: DemoChange | null }) {
  if (!change) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--diffy-line)] px-4 py-6 text-center text-sm text-[var(--diffy-muted)]">
        Select a change in the timeline, or use ↑ / ↓ to move between them.
      </div>
    );
  }

  const showImages = change.kind === "image";

  return (
    <div className="space-y-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-base tracking-tight">
          {change.label}
        </h3>
        <p className="text-sm text-[var(--diffy-muted)] mt-0.5 line-clamp-2">
          {change.description}
        </p>
      </div>

      <div
        className={cn(
          "grid gap-2",
          showImages ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        <Panel label="Before" tone="before">
          {showImages && change.before.imageSrc ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-black/5">
              <Image
                src={change.before.imageSrc}
                alt={change.before.imageAlt ?? "Before"}
                fill
                className="object-cover"
                sizes="160px"
                unoptimized
              />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-[var(--diffy-ink)] whitespace-pre-wrap">
              {change.before.text ?? "—"}
            </p>
          )}
        </Panel>

        <Panel label="After" tone="after">
          {showImages && change.after.imageSrc ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-black/5">
              <Image
                src={change.after.imageSrc}
                alt={change.after.imageAlt ?? "After"}
                fill
                className="object-cover"
                sizes="160px"
                unoptimized
              />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-[var(--diffy-ink)] whitespace-pre-wrap">
              {change.after.text ?? "—"}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
