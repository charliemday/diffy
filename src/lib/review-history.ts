import type { ReviewRunPublic } from "@/lib/review-types";

export const REVIEW_HISTORY_INDEX_KEY = "diffy.reviewHistory.v1";
export const REVIEW_HISTORY_DB = "diffy-review-history";
export const REVIEW_HISTORY_STORE = "snapshots";
export const REVIEW_HISTORY_DB_VERSION = 1;
export const MAX_REVIEW_HISTORY = 20;

export type ReviewHistoryEntry = {
  id: string;
  savedAt: string;
  createdAt: string;
  title: string;
  subtitle: string;
  pageUrl: string;
  previewUrl: string;
  changeCount: number;
  prUrl?: string;
  prNumber?: number;
};

export type ReviewHistorySnapshot = {
  run: ReviewRunPublic;
  afterHtml: string;
  savedAt: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function reviewHistoryTitle(run: ReviewRunPublic): string {
  return (
    run.pr?.title ||
    run.pageTitle ||
    (run.pr ? `${run.pr.owner}/${run.pr.repo}#${run.pr.number}` : "Review")
  );
}

export function reviewHistorySubtitle(run: ReviewRunPublic): string {
  if (run.pr) {
    const head = run.pr.headRef || `PR #${run.pr.number}`;
    const base = run.pr.baseRef || "base";
    return `${head} ← ${base}`;
  }
  try {
    return new URL(run.previewUrl).hostname;
  } catch {
    return run.previewUrl;
  }
}

export function toHistoryEntry(
  run: ReviewRunPublic,
  savedAt = new Date().toISOString(),
): ReviewHistoryEntry {
  return {
    id: run.id,
    savedAt,
    createdAt: run.createdAt,
    title: reviewHistoryTitle(run),
    subtitle: reviewHistorySubtitle(run),
    pageUrl: run.pageUrl,
    previewUrl: run.previewUrl,
    changeCount: run.changes.length,
    prUrl: run.pr?.url,
    prNumber: run.pr?.number,
  };
}

export function parseReviewHistoryIndex(raw: string | null): ReviewHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ReviewHistoryEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== "string" || !rec.id) continue;
      out.push({
        id: rec.id,
        savedAt:
          typeof rec.savedAt === "string"
            ? rec.savedAt
            : new Date().toISOString(),
        createdAt:
          typeof rec.createdAt === "string"
            ? rec.createdAt
            : typeof rec.savedAt === "string"
              ? rec.savedAt
              : new Date().toISOString(),
        title: typeof rec.title === "string" ? rec.title : "Review",
        subtitle: typeof rec.subtitle === "string" ? rec.subtitle : "",
        pageUrl: typeof rec.pageUrl === "string" ? rec.pageUrl : "",
        previewUrl: typeof rec.previewUrl === "string" ? rec.previewUrl : "",
        changeCount:
          typeof rec.changeCount === "number" && Number.isFinite(rec.changeCount)
            ? rec.changeCount
            : 0,
        prUrl: typeof rec.prUrl === "string" ? rec.prUrl : undefined,
        prNumber:
          typeof rec.prNumber === "number" ? rec.prNumber : undefined,
      });
      if (out.length >= MAX_REVIEW_HISTORY) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function upsertHistoryIndex(
  entries: ReviewHistoryEntry[],
  next: ReviewHistoryEntry,
): ReviewHistoryEntry[] {
  return [next, ...entries.filter((e) => e.id !== next.id)].slice(
    0,
    MAX_REVIEW_HISTORY,
  );
}

export function removeFromHistoryIndex(
  entries: ReviewHistoryEntry[],
  id: string,
): ReviewHistoryEntry[] {
  return entries.filter((e) => e.id !== id);
}

export function loadReviewHistoryIndex(
  storage?: Pick<Storage, "getItem"> | null,
): ReviewHistoryEntry[] {
  if (!storage) return [];
  try {
    return parseReviewHistoryIndex(storage.getItem(REVIEW_HISTORY_INDEX_KEY));
  } catch {
    return [];
  }
}

export function writeReviewHistoryIndex(
  entries: ReviewHistoryEntry[],
  storage?: Pick<Storage, "setItem" | "removeItem"> | null,
): void {
  if (!storage) return;
  if (entries.length === 0) {
    storage.removeItem(REVIEW_HISTORY_INDEX_KEY);
    return;
  }
  storage.setItem(REVIEW_HISTORY_INDEX_KEY, JSON.stringify(entries));
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function openHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(REVIEW_HISTORY_DB, REVIEW_HISTORY_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REVIEW_HISTORY_STORE)) {
        db.createObjectStore(REVIEW_HISTORY_STORE, { keyPath: "run.id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("Failed to open review history DB"));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/** Ensure focus styles exist when we reopen HTML via srcDoc. */
export function ensureDiffyFocusStyles(html: string): string {
  if (html.includes('data-diffy-injected="1"')) return html;
  const styleTag =
    '<style data-diffy-injected="1">[data-diffy-id].diffy-focus{outline:3px solid #0f6b57!important;outline-offset:4px;box-shadow:0 0 0 8px rgba(15,107,87,0.18);border-radius:4px;}</style>';
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${styleTag}`);
  }
  return styleTag + html;
}

export async function saveReviewSnapshot(
  run: ReviewRunPublic,
  afterHtml: string,
): Promise<ReviewHistoryEntry | null> {
  if (!run?.id || run.status !== "ready" || !afterHtml) return null;
  const savedAt = new Date().toISOString();
  const snapshot: ReviewHistorySnapshot = {
    run,
    afterHtml: ensureDiffyFocusStyles(afterHtml),
    savedAt,
  };
  const entry = toHistoryEntry(run, savedAt);

  try {
    const db = await openHistoryDb();
    try {
      const tx = db.transaction(REVIEW_HISTORY_STORE, "readwrite");
      const store = tx.objectStore(REVIEW_HISTORY_STORE);
      await idbRequest(store.put(snapshot));
      // Prune overflow snapshots by index order.
      const index = upsertHistoryIndex(
        loadReviewHistoryIndex(browserStorage()),
        entry,
      );
      writeReviewHistoryIndex(index, browserStorage());
      const keep = new Set(index.map((e) => e.id));
      const allKeys = (await idbRequest(store.getAllKeys())) as IDBValidKey[];
      for (const key of allKeys) {
        const id = String(key);
        if (!keep.has(id)) await idbRequest(store.delete(key));
      }
    } finally {
      db.close();
    }
    return entry;
  } catch {
    // Still keep the lightweight index so the user sees the card.
    const index = upsertHistoryIndex(
      loadReviewHistoryIndex(browserStorage()),
      entry,
    );
    writeReviewHistoryIndex(index, browserStorage());
    return entry;
  }
}

export async function getReviewSnapshot(
  id: string,
): Promise<ReviewHistorySnapshot | null> {
  try {
    const db = await openHistoryDb();
    try {
      const tx = db.transaction(REVIEW_HISTORY_STORE, "readonly");
      const store = tx.objectStore(REVIEW_HISTORY_STORE);
      const value = await idbRequest(store.get(id));
      if (!value || typeof value !== "object") return null;
      const snap = value as ReviewHistorySnapshot;
      if (!snap.run?.id || typeof snap.afterHtml !== "string") return null;
      return {
        ...snap,
        afterHtml: ensureDiffyFocusStyles(snap.afterHtml),
      };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function deleteReviewSnapshot(id: string): Promise<void> {
  const index = removeFromHistoryIndex(
    loadReviewHistoryIndex(browserStorage()),
    id,
  );
  writeReviewHistoryIndex(index, browserStorage());
  try {
    const db = await openHistoryDb();
    try {
      const tx = db.transaction(REVIEW_HISTORY_STORE, "readwrite");
      await idbRequest(tx.objectStore(REVIEW_HISTORY_STORE).delete(id));
    } finally {
      db.close();
    }
  } catch {
    /* index already updated */
  }
}

export function listReviewHistory(): ReviewHistoryEntry[] {
  return loadReviewHistoryIndex(browserStorage());
}
