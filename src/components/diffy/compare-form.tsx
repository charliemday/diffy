"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GitBranch, Loader2, LogOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearCompareFormDraft,
  getCompareFormServerSnapshot,
  getCompareFormSnapshot,
  isCompareFormDraftEmpty,
  subscribeCompareFormDraft,
  updateCompareFormDraft,
} from "@/lib/compare-form-storage";

type GhMe = {
  configured: boolean;
  connected: boolean;
  login: string | null;
  stale?: boolean;
};

export function CompareForm() {
  const router = useRouter();
  const draft = useSyncExternalStore(
    subscribeCompareFormDraft,
    getCompareFormSnapshot,
    getCompareFormServerSnapshot,
  );
  const { prUrl, pagePath, protectionBypass } = draft;
  const hasInputs = !isCompareFormDraftEmpty(draft);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gh, setGh] = useState<GhMe | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/github/me");
        const data = (await res.json()) as GhMe;
        if (!cancelled) setGh(data);
      } catch {
        if (!cancelled) {
          setGh({ configured: false, connected: false, login: null });
        }
      }
    })();

    // Surface OAuth callback errors from ?gh_error=
    try {
      const params = new URLSearchParams(window.location.search);
      const ghError = params.get("gh_error");
      if (ghError) {
        setError(
          ghError === "access_denied"
            ? "GitHub authorization was cancelled."
            : `GitHub sign-in failed (${ghError}).`,
        );
        params.delete("gh_error");
        params.delete("gh");
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
        window.history.replaceState({}, "", next);
      }
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
    };
  }, []);

  async function disconnectGithub() {
    await fetch("/api/auth/github/logout", { method: "POST" });
    setGh((prev) =>
      prev
        ? { ...prev, connected: false, login: null }
        : { configured: true, connected: false, login: null },
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prUrl: prUrl.trim(),
          pagePath: pagePath.trim() || undefined,
          protectionBypass: protectionBypass.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        runId?: string;
        error?: string;
        changeCount?: number;
      };
      if (!res.ok || !data.runId) {
        throw new Error(data.error || "Compare failed");
      }
      router.push(`/review/${data.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compare failed");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--diffy-line)] bg-[var(--diffy-panel)]/90 backdrop-blur-sm p-5 sm:p-6 space-y-4 shadow-[0_20px_50px_-40px_rgba(20,40,30,0.45)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--diffy-muted)]">
            Review a pull request
          </p>
          <p className="mt-1 text-sm text-[var(--diffy-muted)]">
            Paste a PR URL. Diffy finds the preview from the GitHub deploy,
            reads visual claims, and highlights each one.
          </p>
        </div>
        {hasInputs ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearCompareFormDraft();
              setError(null);
            }}
            className="h-8 shrink-0 text-xs text-[var(--diffy-muted)] hover:text-[var(--diffy-ink)]"
          >
            <RotateCcw className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-[var(--diffy-ink)]">
          GitHub pull request
        </span>
        <input
          type="url"
          required
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={(e) => updateCompareFormDraft({ prUrl: e.target.value })}
          className="w-full rounded-lg border border-[var(--diffy-line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--diffy-accent)] focus:ring-2 focus:ring-[var(--diffy-accent)]/20"
        />
      </label>

      <div className="rounded-lg border border-[var(--diffy-line)] bg-white/60 px-3 py-3 space-y-2">
        <p className="text-xs font-medium text-[var(--diffy-ink)]">
          GitHub access
        </p>
        {!gh ? (
          <p className="text-xs text-[var(--diffy-muted)]">Checking…</p>
        ) : !gh.configured ? (
          <p className="text-xs text-[var(--diffy-muted)]">
            Public PRs work without sign-in. OAuth isn’t configured on this
            server yet (needs{" "}
            <span className="font-mono">GITHUB_CLIENT_ID</span> /{" "}
            <span className="font-mono">GITHUB_CLIENT_SECRET</span>).
          </p>
        ) : gh.connected && gh.login ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--diffy-line)] bg-white px-2.5 py-1.5 text-xs">
              <GitBranch className="size-3.5" />@{gh.login}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={disconnectGithub}
              className="h-8"
            >
              <LogOut className="size-3.5" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-[var(--diffy-muted)]">
              Public PRs work without sign-in. Connect GitHub for private
              repos.
            </p>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href="/api/auth/github?returnTo=/">
                <GitBranch className="size-3.5" />
                Connect GitHub
              </a>
            </Button>
          </div>
        )}
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-[var(--diffy-ink)]">
          Page path{" "}
          <span className="font-normal text-[var(--diffy-muted)]">
            (optional)
          </span>
        </span>
        <input
          type="text"
          placeholder="/pricing"
          value={pagePath}
          onChange={(e) => updateCompareFormDraft({ pagePath: e.target.value })}
          className="w-full rounded-lg border border-[var(--diffy-line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--diffy-accent)] focus:ring-2 focus:ring-[var(--diffy-accent)]/20"
        />
        <span className="block text-xs text-[var(--diffy-muted)]">
          Leave blank for <span className="font-mono">/</span>, or a path like{" "}
          <span className="font-mono">/pricing</span>. If the PR only touches
          one page route, Diffy infers it.
        </span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-[var(--diffy-ink)]">
          Vercel protection bypass{" "}
          <span className="font-normal text-[var(--diffy-muted)]">
            (optional)
          </span>
        </span>
        <input
          type="password"
          autoComplete="off"
          placeholder="Protection Bypass for Automation secret"
          value={protectionBypass}
          onChange={(e) =>
            updateCompareFormDraft({ protectionBypass: e.target.value })
          }
          className="w-full rounded-lg border border-[var(--diffy-line)] bg-white px-3 py-2.5 text-sm font-mono outline-none focus:border-[var(--diffy-accent)] focus:ring-2 focus:ring-[var(--diffy-accent)]/20"
        />
        <span className="block text-xs text-[var(--diffy-muted)]">
          From Vercel → Project → Settings → Deployment Protection. Saved in
          this browser’s local storage until you clear it; sent only on Diffy’s
          server fetch.
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="bg-[var(--diffy-accent)] text-white hover:bg-[var(--diffy-accent)]/90"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Reviewing…
            </>
          ) : (
            <>
              Review PR
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
        <p className="text-xs text-[var(--diffy-muted)]">
          Works best on SSR / static HTML. Client-only shells may hide the
          claims.
        </p>
      </div>
    </form>
  );
}
