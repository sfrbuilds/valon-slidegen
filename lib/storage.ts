/**
 * Storage abstraction for decks. LocalStorage adapter for v0; swappable
 * for a real DB later without touching the app code.
 *
 * Writes return a boolean: base64 images can push a deck past the
 * localStorage quota, and a silent failure would make persistence stop
 * working with no signal. Callers surface `false` to the user.
 * (IndexedDB is the clean long-term fix for image payloads.)
 */

import type { Deck } from "./types";

export interface Storage {
  getDecks(): Deck[];
  getDeck(id: string): Deck | null;
  saveDeck(deck: Deck): boolean;
  deleteDeck(id: string): void;
}

const STORAGE_KEY = "valon-slidegen-v0";

type StoredShape = {
  version: 1;
  decks: Record<string, Deck>;
};

function readStore(): StoredShape {
  if (typeof window === "undefined") return { version: 1, decks: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, decks: {} };
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== 1 || typeof parsed.decks !== "object") {
      return { version: 1, decks: {} };
    }
    return parsed;
  } catch {
    return { version: 1, decks: {} };
  }
}

function writeStore(store: StoredShape): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    // Quota exceeded or storage unavailable. Report to caller.
    console.error("localStorage write failed:", e);
    return false;
  }
}

export const localStorageAdapter: Storage = {
  getDecks() {
    const store = readStore();
    return Object.values(store.decks).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },
  getDeck(id) {
    const store = readStore();
    return store.decks[id] ?? null;
  },
  saveDeck(deck) {
    const store = readStore();
    store.decks[deck.id] = deck;
    return writeStore(store);
  },
  deleteDeck(id) {
    const store = readStore();
    delete store.decks[id];
    writeStore(store);
  },
};
