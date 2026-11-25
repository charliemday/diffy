"use client";

import { useEffect } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ProgressStepId =
  | "pr"
  | "urls"
  | "bypass"
  | "claims"
  | "fetch"
  | "locate";

export type ProgressStepState = "pending" | "active" | "done" | "waiting" | "error";

export type ProgressStep = {
  id: ProgressStepId;
  label: string;
  detail?: string;
  state: ProgressStepState;
};

type Props = {
  open: boolean;
  title?: string;
  subtitle?: string;
  steps: ProgressStep[];
  error?: string | null;
  bypassValue: string;
  showBypass: boolean;
  onBypassChange: (value: string) => void;
  onContinueWithBypass: () => void;
  onSkipBypass: () => void;
  onClose: () => void;
};

function StepIcon({ state }: { state: ProgressStepState }) {
  if (state === "done") {
    return (
      <span className="flex size-7 items-center justify-center rounded-full bg-[var(--diffy-accent)] text-white">
        <Check className="size-3.5" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex size-7 items-center justify-center rounded-full border border-[var(--diffy-accent)] bg-white text-[var(--diffy-accent)]">
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  }
  if (state === "waiting") {
    return (
      <span className="flex size-7 items-center justify-center rounded-full border border-[var(--diffy-accent)] bg-[var(--diffy-accent)]/10 text-[var(--diffy-accent)] text-[10px] font-semibold">
        !
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex size-7 items-center justify-center rounded-full border border-rose-300 bg-rose-50 text-rose-700">
        <X className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="flex size-7 items-center justify-center rounded-full border border-[var(--diffy-line)] bg-white text-[var(--diffy-muted)]">
      <span className="size-1.5 rounded-full bg-[var(--diffy-line)]" />
    </span>
  );
}

export function CompareProgressDialog({
  open,
  title = "Reviewing pull request",
  subtitle,
  steps,
  error,
  bypassValue,
  showBypass,
  onBypassChange,
  onContinueWithBypass,
  onSkipBypass,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-progress-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#14201a]/40 backdrop-blur-[2px]"
        aria-label="Close progress"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--diffy-line)] bg-[var(--diffy-panel)] shadow-[0_30px_80px_-40px_rgba(20,40,30,0.7)] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              id="compare-progress-title"
              className="text-[10px] uppercase tracking-[0.2em] text-[var(--diffy-muted)]"
            >
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 text-sm font-medium text-[var(--diffy-ink)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 shrink-0 text-[var(--diffy-muted)]"
          >
            <X className="size-4" />
            Cancel
          </Button>
        </div>

        <ol className="mt-5">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            return (
              <li key={step.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <StepIcon state={step.state} />
                  {!isLast ? (
                    <div
                      className={`w-px flex-1 min-h-4 ${
                        step.state === "done"
                          ? "bg-[var(--diffy-accent)]/50"
                          : "bg-[var(--diffy-line)]"
                      }`}
                    />
                  ) : null}
                </div>
                <div className={isLast ? "pb-0" : "pb-4"}>
                  <p
                    className={`text-sm ${
                      step.state === "pending"
                        ? "text-[var(--diffy-muted)]"
                        : "text-[var(--diffy-ink)]"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.detail ? (
                    <p className="mt-0.5 text-xs font-mono text-[var(--diffy-muted)] break-all">
                      {step.detail}
                    </p>
                  ) : null}
                  {showBypass && step.id === "bypass" && step.state === "waiting" ? (
                    <div className="mt-3 space-y-3 rounded-lg border border-[var(--diffy-line)] bg-white/70 p-3">
                      <p className="text-xs text-[var(--diffy-muted)] leading-relaxed">
                        This PR has a Vercel preview. If Deployment Protection is
                        on, Diffy needs the project’s{" "}
                        <span className="font-medium text-[var(--diffy-ink)]">
                          Protection Bypass for Automation
                        </span>{" "}
                        secret so it can load the page and highlight claims.
                      </p>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-[var(--diffy-ink)]">
                          Vercel protection bypass
                        </span>
                        <input
                          type="password"
                          autoComplete="off"
                          autoFocus
                          placeholder="Protection Bypass for Automation secret"
                          value={bypassValue}
                          onChange={(e) => onBypassChange(e.target.value)}
                          className="w-full rounded-lg border border-[var(--diffy-line)] bg-white px-3 py-2 text-sm font-mono outline-none focus:border-[var(--diffy-accent)] focus:ring-2 focus:ring-[var(--diffy-accent)]/20"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={onContinueWithBypass}
                          disabled={!bypassValue.trim()}
                          className="bg-[var(--diffy-accent)] text-white hover:bg-[var(--diffy-accent)]/90"
                        >
                          Continue
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={onSkipBypass}
                        >
                          Preview is public
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
