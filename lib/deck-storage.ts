/**
 * Storage abstraction for decks and custom templates. LocalStorage
 * adapter for v0; swappable for a real DB later without touching the
 * app code.
 *
 * Writes return a boolean: base64 images can push a deck past the
 * localStorage quota, and a silent failure would make persistence stop
 * working with no signal. Callers surface `false` to the user.
 * (IndexedDB is the clean long-term fix for image payloads. Custom
 * templates are tiny text blobs by construction and never carry images.)
 */

import type { Deck } from "./types";
import type { Template } from "./deck-templates";

export interface Storage {
  getDecks(): Deck[];
  getDeck(id: string): Deck | null;
  saveDeck(deck: Deck): boolean;
  deleteDeck(id: string): void;
  getTemplates(): Template[];
  saveTemplate(template: Template): boolean;
  deleteTemplate(id: string): void;
}

const STORAGE_KEY = "valon-slidegen-v0";

type StoredShape = {
  version: 1;
  decks: Record<string, Deck>;
  templates: Record<string, Template>;
};

function readStore(): StoredShape {
  if (typeof window === "undefined") return { version: 1, decks: {}, templates: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, decks: {}, templates: {} };
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== 1 || typeof parsed.decks !== "object") {
      return { version: 1, decks: {}, templates: {} };
    }
    // Stores written before custom templates existed lack the field.
    if (typeof parsed.templates !== "object" || parsed.templates === null) {
      parsed.templates = {};
    }
    // Decks written before multi-document support carry a single
    // `contextDoc` (object or null) instead of `contextDocs`. Normalize
    // on read so the rest of the app only ever sees the array shape.
    for (const deck of Object.values(parsed.decks)) {
      if (!Array.isArray(deck.contextDocs)) {
        const legacy = (deck as unknown as { contextDoc?: unknown }).contextDoc;
        deck.contextDocs =
          legacy && typeof legacy === "object"
            ? [legacy as Deck["contextDocs"][number]]
            : [];
      }
    }
    return parsed;
  } catch {
    return { version: 1, decks: {}, templates: {} };
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
  getTemplates() {
    const store = readStore();
    return Object.values(store.templates).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  },
  saveTemplate(template) {
    const store = readStore();
    store.templates[template.id] = template;
    return writeStore(store);
  },
  deleteTemplate(id) {
    const store = readStore();
    delete store.templates[id];
    writeStore(store);
  },
};
