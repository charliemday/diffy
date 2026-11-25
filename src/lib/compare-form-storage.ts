export const COMPARE_FORM_STORAGE_KEY = "diffy.compareForm.v3";
const LEGACY_COMPARE_FORM_STORAGE_KEY = "diffy.compareForm.v2";

export type CompareFormDraft = {
  prUrl: string;
  pagePath: string;
  protectionBypass: string;
};

export const EMPTY_COMPARE_FORM_DRAFT: CompareFormDraft = Object.freeze({
  prUrl: "",
  pagePath: "",
  protectionBypass: "",
});

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isCompareFormDraftEmpty(draft: CompareFormDraft): boolean {
  return !draft.prUrl && !draft.pagePath && !draft.protectionBypass;
}

export function parseCompareFormDraft(raw: string | null): CompareFormDraft {
  if (!raw) return EMPTY_COMPARE_FORM_DRAFT;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") {
      return EMPTY_COMPARE_FORM_DRAFT;
    }
    const draft: CompareFormDraft = {
      prUrl: typeof parsed.prUrl === "string" ? parsed.prUrl : "",
      pagePath: typeof parsed.pagePath === "string" ? parsed.pagePath : "",
      protectionBypass:
        typeof parsed.protectionBypass === "string"
          ? parsed.protectionBypass
          : "",
    };
    return isCompareFormDraftEmpty(draft) ? EMPTY_COMPARE_FORM_DRAFT : draft;
  } catch {
    return EMPTY_COMPARE_FORM_DRAFT;
  }
}

export function loadCompareFormDraft(
  storage?: Pick<Storage, "getItem"> | null,
): CompareFormDraft {
  if (!storage) return EMPTY_COMPARE_FORM_DRAFT;
  try {
    const current = parseCompareFormDraft(
      storage.getItem(COMPARE_FORM_STORAGE_KEY),
    );
    if (!isCompareFormDraftEmpty(current)) return current;
    return parseCompareFormDraft(
      storage.getItem(LEGACY_COMPARE_FORM_STORAGE_KEY),
    );
  } catch {
    return EMPTY_COMPARE_FORM_DRAFT;
  }
}

export function writeCompareFormDraft(
  draft: CompareFormDraft,
  storage?: Pick<Storage, "setItem" | "removeItem"> | null,
): string | null {
  const serialized = isCompareFormDraftEmpty(draft)
    ? null
    : JSON.stringify(draft);
  if (!storage) return serialized;
  if (serialized === null) {
    storage.removeItem(COMPARE_FORM_STORAGE_KEY);
    storage.removeItem(LEGACY_COMPARE_FORM_STORAGE_KEY);
  } else {
    storage.setItem(COMPARE_FORM_STORAGE_KEY, serialized);
  }
  return serialized;
}

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedDraft: CompareFormDraft = EMPTY_COMPARE_FORM_DRAFT;
let fallbackDraft: CompareFormDraft | null = null;

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function getCompareFormServerSnapshot(): CompareFormDraft {
  return EMPTY_COMPARE_FORM_DRAFT;
}

export function getCompareFormSnapshot(): CompareFormDraft {
  const storage = browserStorage();
  if (!storage) return fallbackDraft ?? EMPTY_COMPARE_FORM_DRAFT;
  try {
    const raw =
      storage.getItem(COMPARE_FORM_STORAGE_KEY) ??
      storage.getItem(LEGACY_COMPARE_FORM_STORAGE_KEY);
    if (raw === cachedRaw) return cachedDraft;
    cachedRaw = raw;
    cachedDraft = parseCompareFormDraft(raw);
    fallbackDraft = null;
    return cachedDraft;
  } catch {
    return fallbackDraft ?? EMPTY_COMPARE_FORM_DRAFT;
  }
}

export function subscribeCompareFormDraft(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === COMPARE_FORM_STORAGE_KEY ||
      event.key === LEGACY_COMPARE_FORM_STORAGE_KEY
    ) {
      emitChange();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function saveCompareFormDraft(next: CompareFormDraft): void {
  const normalized = isCompareFormDraftEmpty(next)
    ? EMPTY_COMPARE_FORM_DRAFT
    : next;
  const storage = browserStorage();
  if (storage) {
    try {
      const serialized = writeCompareFormDraft(normalized, storage);
      cachedRaw = serialized;
      cachedDraft = normalized;
      fallbackDraft = null;
      emitChange();
      return;
    } catch {
      // Fall back to in-memory state if storage is blocked or full
    }
  }
  fallbackDraft = normalized;
  emitChange();
}

export function clearCompareFormDraft(): void {
  saveCompareFormDraft(EMPTY_COMPARE_FORM_DRAFT);
}

export function updateCompareFormDraft(patch: Partial<CompareFormDraft>): void {
  saveCompareFormDraft({ ...getCompareFormSnapshot(), ...patch });
}
