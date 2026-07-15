import { afterEach, describe, expect, it, vi } from "vitest";
import { localStorageAdapter } from "../storage";
import type { Deck } from "../types";

function makeDeck(id: string, overrides: Partial<Deck> = {}): Deck {
  return {
    id,
    title: "Deck",
    team: "new-ventures",
    audience: "internal",
    brief: "brief",
    targetLength: 3,
    contextDoc: null,
    templateId: null,
    slides: [{ id: "s1", layout: "content", heading: "h", bullets: [] }],
    chatHistory: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Minimal in-memory localStorage; `failWrites` simulates a full quota. */
function stubLocalStorage(opts: { failWrites?: boolean } = {}) {
  const data = new Map<string, string>();
  const ls = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.failWrites) throw new DOMException("QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
  vi.stubGlobal("window", { localStorage: ls });
  return data;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("localStorageAdapter", () => {
  it("round-trips a deck and reports success", () => {
    stubLocalStorage();
    expect(localStorageAdapter.saveDeck(makeDeck("d1"))).toBe(true);
    expect(localStorageAdapter.getDeck("d1")?.id).toBe("d1");
  });

  it("returns false instead of throwing when the quota is exceeded", () => {
    stubLocalStorage({ failWrites: true });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(localStorageAdapter.saveDeck(makeDeck("d1"))).toBe(false);
    spy.mockRestore();
  });

  it("read-modify-write on the CURRENT state preserves concurrent field updates", () => {
    // Regression for the stale-closure bug: an optimistic chat message is
    // persisted, then a second writer updates slides. If the second write
    // starts from stale state, the message is lost; starting from current
    // state (what store.updateDeck does) keeps both.
    stubLocalStorage();
    localStorageAdapter.saveDeck(makeDeck("d1"));

    // Writer A: append a chat message (reads current, writes).
    const a = localStorageAdapter.getDeck("d1")!;
    localStorageAdapter.saveDeck({
      ...a,
      chatHistory: [
        {
          id: "m1",
          role: "user",
          content: "make it punchier",
          timestamp: "2026-01-01T00:00:01.000Z",
          scope: "deck",
        },
      ],
    });

    // Writer B (atomic pattern): reads CURRENT deck, updates slides only.
    const current = localStorageAdapter.getDeck("d1")!;
    localStorageAdapter.saveDeck({
      ...current,
      slides: [{ id: "s2", layout: "content", heading: "new", bullets: [] }],
    });

    const result = localStorageAdapter.getDeck("d1")!;
    expect(result.slides[0].id).toBe("s2");
    expect(result.chatHistory).toHaveLength(1); // message survived

    // Contrast: the stale-closure pattern (writing from `a`) would have
    // erased the message.
    localStorageAdapter.saveDeck({ ...a, slides: result.slides });
    expect(localStorageAdapter.getDeck("d1")!.chatHistory).toHaveLength(0);
  });
});
