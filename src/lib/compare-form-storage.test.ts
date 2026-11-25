import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPARE_FORM_STORAGE_KEY,
  EMPTY_COMPARE_FORM_DRAFT,
  loadCompareFormDraft,
  parseCompareFormDraft,
  writeCompareFormDraft,
  type CompareFormDraft,
} from "./compare-form-storage";

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    size() {
      return map.size;
    },
  };
}

describe("compare-form-storage", () => {
  it("persists and restores compare inputs", () => {
    const storage = createMemoryStorage();
    const draft: CompareFormDraft = {
      prUrl: "https://github.com/acme/site/pull/42",
      pagePath: "/pricing",
      protectionBypass: "bypass-secret-123",
    };

    writeCompareFormDraft(draft, storage);
    assert.deepEqual(loadCompareFormDraft(storage), draft);
  });

  it("migrates a v2 draft's PR URL and bypass secret", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "diffy.compareForm.v2",
      JSON.stringify({
        baseUrl: "https://example.com",
        previewUrl: "https://preview.example.com",
        prUrl: "https://github.com/acme/site/pull/9",
        protectionBypass: "secret",
      }),
    );

    assert.deepEqual(loadCompareFormDraft(storage), {
      prUrl: "https://github.com/acme/site/pull/9",
      pagePath: "",
      protectionBypass: "secret",
    });
  });

  it("removes the storage entry when all fields are cleared", () => {
    const storage = createMemoryStorage();
    writeCompareFormDraft(
      {
        ...EMPTY_COMPARE_FORM_DRAFT,
        prUrl: "https://github.com/acme/site/pull/1",
      },
      storage,
    );
    assert.equal(storage.size(), 1);

    writeCompareFormDraft(EMPTY_COMPARE_FORM_DRAFT, storage);
    assert.equal(storage.size(), 0);
    assert.deepEqual(loadCompareFormDraft(storage), EMPTY_COMPARE_FORM_DRAFT);
  });

  it("falls back safely on corrupted or partial JSON", () => {
    assert.deepEqual(parseCompareFormDraft("not-json"), EMPTY_COMPARE_FORM_DRAFT);
    assert.deepEqual(
      parseCompareFormDraft(
        JSON.stringify({ prUrl: "https://github.com/acme/site/pull/1", pagePath: 123 }),
      ),
      {
        prUrl: "https://github.com/acme/site/pull/1",
        pagePath: "",
        protectionBypass: "",
      },
    );
  });

  it("returns empty draft when storage throws", () => {
    const throwingStorage = {
      getItem() {
        throw new Error("SecurityError");
      },
    };
    assert.deepEqual(
      loadCompareFormDraft(throwingStorage),
      EMPTY_COMPARE_FORM_DRAFT,
    );
    assert.equal(
      parseCompareFormDraft(null),
      EMPTY_COMPARE_FORM_DRAFT,
    );
    assert.equal(COMPARE_FORM_STORAGE_KEY, "diffy.compareForm.v3");
  });
});
