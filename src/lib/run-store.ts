import type { ReviewRun } from "@/lib/review-types";

const TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_RUNS = 40;

type Stored = {
  run: ReviewRun;
  expiresAt: number;
};

const globalForStore = globalThis as typeof globalThis & {
  __diffyRunStore?: Map<string, Stored>;
};

function store(): Map<string, Stored> {
  if (!globalForStore.__diffyRunStore) {
    globalForStore.__diffyRunStore = new Map();
  }
  return globalForStore.__diffyRunStore;
}

function prune(now = Date.now()) {
  const map = store();
  for (const [id, entry] of map) {
    if (entry.expiresAt <= now) map.delete(id);
  }
  if (map.size <= MAX_RUNS) return;
  const ordered = [...map.entries()].sort(
    (a, b) => a[1].expiresAt - b[1].expiresAt,
  );
  const overflow = map.size - MAX_RUNS;
  for (let i = 0; i < overflow; i++) {
    map.delete(ordered[i][0]);
  }
}

export function saveRun(run: ReviewRun): void {
  prune();
  store().set(run.id, { run, expiresAt: Date.now() + TTL_MS });
}

export function getRun(id: string): ReviewRun | null {
  prune();
  const entry = store().get(id);
  if (!entry) return null;
  return entry.run;
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
