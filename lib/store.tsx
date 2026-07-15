"use client";

/**
 * React context wrapping the storage adapter. Provides deck CRUD plus
 * chat message append plus slide update.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ChatMessage, Deck, Slide } from "./types";
import { nowIso } from "./types";
import { localStorageAdapter } from "./storage";

type StoreContext = {
  decks: Deck[];
  refresh: () => void;
  getDeck: (id: string) => Deck | null;
  saveDeck: (deck: Deck) => boolean;
  deleteDeck: (id: string) => void;
  /**
   * Atomic read-modify-write on the persisted deck. Always prefer this
   * over saveDeck when React state might be stale (e.g. after other
   * writes in the same async handler): the updater receives the CURRENT
   * persisted deck, so it cannot overwrite fields it did not touch.
   */
  updateDeck: (deckId: string, updater: (current: Deck) => Deck) => boolean;
  updateSlide: (deckId: string, slide: Slide) => boolean;
  addChatMessage: (deckId: string, message: ChatMessage) => boolean;
  // Roll back an optimistically appended message when its request fails.
  removeChatMessage: (deckId: string, messageId: string) => void;
};

const StoreCtx = createContext<StoreContext | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [decks, setDecks] = useState<Deck[]>([]);

  const refresh = useCallback(() => {
    setDecks(localStorageAdapter.getDecks());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getDeck = useCallback((id: string) => localStorageAdapter.getDeck(id), []);

  const saveDeck = useCallback((deck: Deck) => {
    const ok = localStorageAdapter.saveDeck({ ...deck, updatedAt: nowIso() });
    setDecks(localStorageAdapter.getDecks());
    return ok;
  }, []);

  const deleteDeck = useCallback((id: string) => {
    localStorageAdapter.deleteDeck(id);
    setDecks(localStorageAdapter.getDecks());
  }, []);

  const updateDeck = useCallback(
    (deckId: string, updater: (current: Deck) => Deck) => {
      const current = localStorageAdapter.getDeck(deckId);
      if (!current) return false;
      const ok = localStorageAdapter.saveDeck({
        ...updater(current),
        id: deckId,
        updatedAt: nowIso(),
      });
      setDecks(localStorageAdapter.getDecks());
      return ok;
    },
    []
  );

  const updateSlide = useCallback((deckId: string, slide: Slide) => {
    const deck = localStorageAdapter.getDeck(deckId);
    if (!deck) return false;
    const nextSlides = deck.slides.map((s) => (s.id === slide.id ? slide : s));
    const nextDeck = { ...deck, slides: nextSlides, updatedAt: nowIso() };
    const ok = localStorageAdapter.saveDeck(nextDeck);
    setDecks(localStorageAdapter.getDecks());
    return ok;
  }, []);

  const addChatMessage = useCallback((deckId: string, message: ChatMessage) => {
    const deck = localStorageAdapter.getDeck(deckId);
    if (!deck) return false;
    const nextDeck = {
      ...deck,
      chatHistory: [...deck.chatHistory, message],
      updatedAt: nowIso(),
    };
    const ok = localStorageAdapter.saveDeck(nextDeck);
    setDecks(localStorageAdapter.getDecks());
    return ok;
  }, []);

  const removeChatMessage = useCallback((deckId: string, messageId: string) => {
    const deck = localStorageAdapter.getDeck(deckId);
    if (!deck) return;
    const nextDeck = {
      ...deck,
      chatHistory: deck.chatHistory.filter((m) => m.id !== messageId),
      updatedAt: nowIso(),
    };
    localStorageAdapter.saveDeck(nextDeck);
    setDecks(localStorageAdapter.getDecks());
  }, []);

  return (
    <StoreCtx.Provider
      value={{ decks, refresh, getDeck, saveDeck, deleteDeck, updateDeck, updateSlide, addChatMessage, removeChatMessage }}
    >
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore(): StoreContext {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
