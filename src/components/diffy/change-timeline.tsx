"use client";

import { ImageIcon, LayoutTemplate, Type } from "lucide-react";
import type { ChangeKind, DemoChange } from "@/data/demo";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const KIND_META: Record<
  ChangeKind,
  { label: string; icon: typeof Type; className: string }
> = {
  copy: {
    label: "Copy",
    icon: Type,
    className: "bg-sky-100 text-sky-800 border-sky-200",
  },
  image: {
    label: "Image",
    icon: ImageIcon,
    className: "bg-amber-100 text-amber-900 border-amber-200",
  },
  layout: {
    label: "Layout",
    icon: LayoutTemplate,
    className: "bg-emerald-100 text-emerald-900 border-emerald-200",
  },
};

export function ChangeTimeline({
  changes,
  activeId,
  onSelect,
}: {
  changes: DemoChange[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <ol className="relative space-y-1 pr-3">
        <div
          className="absolute left-[15px] top-3 bottom-3 w-px bg-[var(--diffy-line)]"
          aria-hidden
        />
        {changes.map((change, index) => {
          const meta = KIND_META[change.kind];
          const Icon = meta.icon;
          const active = change.id === activeId;

          return (
            <li key={change.id}>
              <button
                type="button"
                onClick={() => onSelect(change.id)}
                className={cn(
                  "group relative w-full text-left rounded-lg pl-10 pr-3 py-3 transition-colors duration-200",
                  active
                    ? "bg-[var(--diffy-surface-strong)]"
                    : "hover:bg-[var(--diffy-surface)]",
                )}
              >
                <span
                  className={cn(
                    "absolute left-2 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded-full border text-[10px] font-semibold transition-all duration-300",
                    active
                      ? "border-[var(--diffy-marker)] bg-[var(--diffy-marker)] text-white scale-110"
                      : "border-[var(--diffy-line)] bg-white text-[var(--diffy-muted)]",
                  )}
                >
                  {index + 1}
                </span>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm tracking-tight truncate">
                      {change.label}
                    </div>
                    <p className="text-xs text-[var(--diffy-muted)] mt-0.5 line-clamp-2">
                      {change.description}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 gap-1 font-normal",
                      meta.className,
                    )}
                  >
                    <Icon className="size-3" />
                    {meta.label}
                  </Badge>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </ScrollArea>
  );
}
