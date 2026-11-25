"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type NorthlinePageProps = {
  version: "before" | "after";
  activeSelector?: string | null;
  className?: string;
};

function DiffAnchor({
  id,
  activeSelector,
  className,
  children,
}: {
  id: string;
  activeSelector?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const active = activeSelector === id;
  return (
    <div
      data-diffy-id={id}
      className={cn(
        "relative scroll-mt-24 transition-[box-shadow,transform] duration-500 ease-out",
        active &&
          "z-10 rounded-sm ring-2 ring-[var(--diffy-marker)] ring-offset-4 ring-offset-[var(--nl-bg)] scale-[1.01]",
        className,
      )}
    >
      {children}
      {active ? (
        <span className="pointer-events-none absolute -left-3 top-0 bottom-0 w-1 rounded-full bg-[var(--diffy-marker)] animate-pulse" />
      ) : null}
    </div>
  );
}

export function NorthlinePage({
  version,
  activeSelector,
  className,
}: NorthlinePageProps) {
  const isAfter = version === "after";

  const headline = isAfter
    ? "Pack light. Stay out longer."
    : "Gear built for the long trail.";
  const cta = isAfter ? "Shop the spring kit" : "Shop packs";
  const featureBody = isAfter
    ? "Three-layer shells that breathe on the climb and seal when the squall hits."
    : "Our shells keep you dry when the forecast turns. Layer up and keep moving.";
  const heroSrc = isAfter ? "/demo/hero-after.svg" : "/demo/hero-before.svg";
  const heroAlt = isAfter
    ? "Sunlit alpine camp with pack and tent"
    : "Muted ridge line at dusk";

  return (
    <div
      className={cn(
        "min-h-full text-[var(--nl-ink)] [--nl-bg:#f3f6f4] [--nl-ink:#14201a] [--nl-muted:#4d5c54] [--nl-accent:#0f6b57] [--nl-line:#d5ddd7]",
        className,
      )}
      style={{ background: "var(--nl-bg)" }}
    >
      <header className="flex items-center justify-between px-8 py-5 border-b border-[var(--nl-line)]">
        <div className="font-[family-name:var(--font-display)] text-xl tracking-tight font-semibold">
          Northline
        </div>
        <nav className="hidden sm:flex gap-6 text-sm text-[var(--nl-muted)]">
          <span>Packs</span>
          <span>Shells</span>
          <span>Guides</span>
        </nav>
      </header>

      <section className="grid lg:grid-cols-[1.05fr_0.95fr] gap-8 px-8 py-10 items-center">
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--nl-accent)]">
            Spring trail collection
          </p>
          <DiffAnchor id="hero-headline" activeSelector={activeSelector}>
            <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl leading-[1.05] tracking-tight">
              {headline}
            </h1>
          </DiffAnchor>
          <p className="text-[var(--nl-muted)] text-base max-w-md leading-relaxed">
            Ultralight kits for weekend ridge lines and week-long traverses.
            Designed in Portland. Proven above treeline.
          </p>
          <DiffAnchor
            id="hero-cta"
            activeSelector={activeSelector}
            className="inline-block"
          >
            <button
              type="button"
              className="cursor-pointer rounded-md bg-[var(--nl-accent)] text-white px-5 py-2.5 text-sm font-medium"
            >
              {cta}
            </button>
          </DiffAnchor>
        </div>

        <DiffAnchor id="hero-image" activeSelector={activeSelector}>
          <div className="relative aspect-[8/5] overflow-hidden rounded-md bg-[#dfe6e1]">
            <Image
              src={heroSrc}
              alt={heroAlt}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              unoptimized
            />
          </div>
        </DiffAnchor>
      </section>

      <section className="px-8 pb-12">
        <div className="grid sm:grid-cols-3 gap-6 border-t border-[var(--nl-line)] pt-10">
          <article className="space-y-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg">
              Weatherproof
            </h2>
            <DiffAnchor id="feature-body" activeSelector={activeSelector}>
              <p className="text-sm text-[var(--nl-muted)] leading-relaxed">
                {featureBody}
              </p>
            </DiffAnchor>
          </article>
          <article className="space-y-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg">
              Carry smart
            </h2>
            <p className="text-sm text-[var(--nl-muted)] leading-relaxed">
              Framed packs with load lifters that stay quiet on scramble days.
            </p>
          </article>
          <article className="space-y-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg">
              Repairable
            </h2>
            <p className="text-sm text-[var(--nl-muted)] leading-relaxed">
              Lifetime zipper and buckle service. Keep gear in the wild, not the
              landfill.
            </p>
          </article>
        </div>

        {isAfter ? (
          <DiffAnchor
            id="press-strip"
            activeSelector={activeSelector}
            className="mt-10"
          >
            <div className="rounded-md border border-[var(--nl-line)] bg-white/60 px-5 py-4 text-sm text-[var(--nl-muted)] tracking-wide">
              As seen in{" "}
              <span className="text-[var(--nl-ink)] font-medium">Outside</span>,{" "}
              <span className="text-[var(--nl-ink)] font-medium">
                Trail Runner
              </span>
              , and{" "}
              <span className="text-[var(--nl-ink)] font-medium">
                Wirecutter
              </span>
              .
            </div>
          </DiffAnchor>
        ) : (
          <div data-diffy-id="press-strip" className="mt-10 h-0 overflow-hidden" />
        )}
      </section>
    </div>
  );
}
