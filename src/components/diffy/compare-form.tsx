"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GitBranch, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

type GhMe = {
  configured: boolean;
  connected: boolean;
  login: string | null;
  stale?: boolean;
};

export function CompareForm() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [protectionBypass, setProtectionBypass] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [polishLabels, setPolishLabels] = useState(false);
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
          baseUrl,
          previewUrl,
          polishLabels,
          protectionBypass: protectionBypass.trim() || undefined,
          prUrl: prUrl.trim() || undefined,
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
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--diffy-muted)]">
          Compare two URLs
        </p>
        <p className="mt-1 text-sm text-[var(--diffy-muted)]">
          Base is the live page. Preview is the PR deploy of the same page.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--diffy-ink)]">
            Base URL
          </span>
          <input
            type="url"
            required
            placeholder="https://example.com/pricing"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--diffy-line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--diffy-accent)] focus:ring-2 focus:ring-[var(--diffy-accent)]/20"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[var(--diffy-ink)]">
            Preview URL
          </span>
          <input
            type="url"
            required
            placeholder="https://my-app-git-branch.vercel.app/pricing"
            value={previewUrl}
            onChange={(e) => setPreviewUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--diffy-line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--diffy-accent)] focus:ring-2 focus:ring-[var(--diffy-accent)]/20"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-[var(--diffy-ink)]">
          GitHub pull request{" "}
          <span className="font-normal text-[var(--diffy-muted)]">
            (optional)
          </span>
        </span>
        <input
          type="url"
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          className="w-full rounded-lg border border-[var(--diffy-line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--diffy-accent)] focus:ring-2 focus:ring-[var(--diffy-accent)]/20"
        />
        <span className="block text-xs text-[var(--diffy-muted)]">
          When set, Diffy keeps only copy / layout / image changes that match
          real content edits in the PR — formatting-only hunks and carousel
          noise are hidden.
        </span>
      </label>

      {prUrl.trim() ? (
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
      ) : null}

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
          onChange={(e) => setProtectionBypass(e.target.value)}
          className="w-full rounded-lg border border-[var(--diffy-line)] bg-white px-3 py-2.5 text-sm font-mono outline-none focus:border-[var(--diffy-accent)] focus:ring-2 focus:ring-[var(--diffy-accent)]/20"
        />
        <span className="block text-xs text-[var(--diffy-muted)]">
          From Vercel → Project → Settings → Deployment Protection. Sent only
          on Diffy’s server fetch; not stored in the browser after compare.
        </span>
      </label>

      <label className="flex items-start gap-2.5 text-sm text-[var(--diffy-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={polishLabels}
          onChange={(e) => setPolishLabels(e.target.checked)}
          className="mt-1 size-4 rounded border-[var(--diffy-line)]"
        />
        <span>
          Improve labels with AI. Sends change text to OpenAI when a server key
          is configured. Off by default.
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
              Comparing…
            </>
          ) : (
            <>
              Compare
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
        <p className="text-xs text-[var(--diffy-muted)]">
          Works best on SSR / static HTML. Client-only shells may show no
          changes.
        </p>
      </div>
    </form>
  );
}
