import type { ReviewRun } from "@/lib/review-types";

const TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_RUNS = 40;
const CACHE_NAME = "diffy-runs-v1";

type Stored = {
  run: ReviewRun;
  expiresAt: number;
};

const globalForStore = globalThis as typeof globalThis & {
  __diffyRunStore?: Map<string, Stored>;
};

function memory(): Map<string, Stored> {
  if (!globalForStore.__diffyRunStore) {
    globalForStore.__diffyRunStore = new Map();
  }
  return globalForStore.__diffyRunStore;
}

function prune(now = Date.now()) {
  const map = memory();
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

/**
 * Cache API key. Use the same http://cache.local/ convention OpenNext uses —
 * arbitrary https hosts can fail to store on some Worker setups.
 */
function cacheKey(id: string): Request {
  return new Request(
    `http://cache.local/diffy-runs/${encodeURIComponent(id)}`,
  );
}

async function openRunCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined") return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function persistRun(entry: Stored): Promise<void> {
  const cache = await openRunCache();
  if (!cache) return;
  const maxAge = Math.max(1, Math.floor((entry.expiresAt - Date.now()) / 1000));
  try {
    // Cloudflare Cache API silently skips `private` / no-store responses.
    // Use public + max-age so put actually stores across isolates.
    await cache.put(
      cacheKey(entry.run.id),
      new Response(JSON.stringify(entry), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${maxAge}`,
        },
      }),
    );
  } catch {
    // Cache API unavailable (local Node) — memory-only is fine there.
  }
}

async function readPersisted(id: string): Promise<Stored | null> {
  const cache = await openRunCache();
  if (!cache) return null;
  try {
    const res = await cache.match(cacheKey(id));
    if (!res) return null;
    const entry = (await res.json()) as Stored;
    if (!entry?.run?.id || typeof entry.expiresAt !== "number") return null;
    if (entry.expiresAt <= Date.now()) {
      try {
        await cache.delete(cacheKey(id));
      } catch {
        /* ignore */
      }
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export async function saveRun(run: ReviewRun): Promise<void> {
  prune();
  const entry: Stored = { run, expiresAt: Date.now() + TTL_MS };
  memory().set(run.id, entry);
  // Durable across Cloudflare Worker isolates (in-memory Map is not).
  await persistRun(entry);
}

export async function getRun(id: string): Promise<ReviewRun | null> {
  prune();
  const local = memory().get(id);
  if (local) {
    if (local.expiresAt <= Date.now()) {
      memory().delete(id);
    } else {
      return local.run;
    }
  }

  const persisted = await readPersisted(id);
  if (!persisted) return null;
  memory().set(id, persisted);
  return persisted.run;
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
