import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompareForm } from "@/components/diffy/compare-form";

export default function HomePage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[var(--diffy-bg)] text-[var(--diffy-ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 15% -10%, rgba(15,107,87,0.18), transparent 55%), radial-gradient(ellipse 60% 45% at 90% 10%, rgba(70,120,150,0.16), transparent 50%), linear-gradient(180deg, #e8efea 0%, #f4f7f5 42%, #eef3f0 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cpath d='M0 60h120M60 0v120' stroke='%2314201a' stroke-opacity='0.04' stroke-width='1'/%3E%3C/svg%3E\")",
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="font-[family-name:var(--font-display)] text-2xl tracking-tight font-semibold">
          Diffy
        </div>
        <Link
          href="/review/demo"
          className="text-sm text-[var(--diffy-muted)] hover:text-[var(--diffy-ink)] transition-colors"
        >
          Open demo
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col px-6 pb-20 pt-10 sm:pt-16 lg:pt-20">
        <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-700">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--diffy-accent)] mb-5">
            Visual PR review
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight">
            Diffy
          </h1>
          <p className="mt-6 max-w-xl text-lg sm:text-xl text-[var(--diffy-muted)] leading-relaxed">
            Paste a live page and a PR preview. Diffy finds copy, image, and
            layout changes — then lets you step through them on the page.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-[var(--diffy-line)] bg-white/70"
            >
              <Link href="/review/demo">
                Try Demo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <p className="text-sm text-[var(--diffy-muted)]">
              Or compare two URLs below
            </p>
          </div>
        </div>

        <div className="mt-14 sm:mt-16 max-w-3xl animate-in fade-in duration-1000 delay-100 fill-mode-both">
          <CompareForm />
        </div>

        <div className="mt-16 sm:mt-20 grid lg:grid-cols-[1.2fr_0.8fr] gap-6 items-stretch animate-in fade-in duration-1000 delay-150 fill-mode-both">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--diffy-line)] bg-white/70 shadow-[0_30px_60px_-40px_rgba(20,40,30,0.5)]">
            <div className="flex items-center gap-2 border-b border-[var(--diffy-line)] bg-[#eef2ef] px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#e8a0a0]" />
              <span className="size-2.5 rounded-full bg-[#e6c98a]" />
              <span className="size-2.5 rounded-full bg-[#9dcca8]" />
              <span className="ml-2 text-xs text-[var(--diffy-muted)] font-mono">
                preview · after
              </span>
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--diffy-accent)]">
                Highlighted change
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl sm:text-4xl tracking-tight max-w-md">
                Pack light. Stay out longer.
              </h2>
              <p className="mt-3 text-[var(--diffy-muted)] max-w-md">
                The proxied preview stays on the left. Diffy scrolls and rings
                the active change so reviewers never lose page context.
              </p>
              <div className="mt-6 h-2 w-28 rounded-full bg-[var(--diffy-marker)] animate-pulse" />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--diffy-line)] bg-[var(--diffy-panel)] p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--diffy-muted)]">
                Timeline
              </p>
              <ul className="mt-4 space-y-3">
                {[
                  "Hero headline",
                  "Hero image",
                  "Primary CTA",
                  "Feature body copy",
                  "Press strip added",
                ].map((label, i) => (
                  <li
                    key={label}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      i === 0
                        ? "bg-[var(--diffy-surface-strong)] font-medium"
                        : "text-[var(--diffy-muted)]"
                    }`}
                  >
                    <span
                      className={`flex size-6 items-center justify-center rounded-full text-[10px] ${
                        i === 0
                          ? "bg-[var(--diffy-marker)] text-white"
                          : "border border-[var(--diffy-line)] bg-white"
                      }`}
                    >
                      {i + 1}
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-6 text-xs text-[var(--diffy-muted)]">
              Demo data from a sample Northline spring landing refresh.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
