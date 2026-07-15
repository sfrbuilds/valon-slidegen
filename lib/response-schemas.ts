/**
 * Gemini responseSchema definitions shared across API routes.
 *
 * These lock the JSON shape at the model level (not just via prompt), so
 * structured fields like chartData survive generation reliably. Kept in
 * one file so the draft, redraft, deck-redraft, and eval routes cannot
 * drift apart.
 */

import { Type, type Schema } from "@google/genai";

export const GEMINI_CHART_DATA_SCHEMA: Schema = {
  type: Type.OBJECT,
  nullable: true,
  properties: {
    type: { type: Type.STRING, enum: ["bar", "line"] },
    labels: { type: Type.ARRAY, items: { type: Type.STRING } },
    series: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          values: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        },
        required: ["name", "values"],
      },
    },
    caption: { type: Type.STRING, nullable: true },
    yAxisLabel: { type: Type.STRING, nullable: true },
    isDummyData: { type: Type.BOOLEAN },
  },
  required: ["type", "labels", "series", "isDummyData"],
};

export const GEMINI_SLIDE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    layout: {
      type: Type.STRING,
      enum: ["title", "content", "section"],
    },
    heading: { type: Type.STRING },
    subheading: { type: Type.STRING, nullable: true },
    bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
    imageIdea: { type: Type.STRING, nullable: true },
    chartData: GEMINI_CHART_DATA_SCHEMA,
  },
  required: ["layout", "heading"],
};

export const GEMINI_DRAFT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    deckTitle: { type: Type.STRING },
    slides: { type: Type.ARRAY, items: GEMINI_SLIDE_SCHEMA },
  },
  required: ["deckTitle", "slides"],
};

export const GEMINI_REDRAFT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    slide: {
      ...GEMINI_SLIDE_SCHEMA,
      required: ["layout", "heading", "bullets"],
    },
    editSummary: { type: Type.STRING },
  },
  required: ["slide", "editSummary"],
};

export const GEMINI_DECK_REDRAFT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        ...GEMINI_SLIDE_SCHEMA,
        properties: {
          // Stable identity: the model echoes each source slide's id so
          // the merge survives inserted, removed, or reordered slides.
          sourceSlideId: { type: Type.STRING, nullable: true },
          ...(GEMINI_SLIDE_SCHEMA.properties ?? {}),
        },
        required: ["sourceSlideId", "layout", "heading"],
      },
    },
    editSummary: { type: Type.STRING },
  },
  required: ["slides", "editSummary"],
};

export const GEMINI_EVAL_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: ["on-brand", "needs-revision"] },
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slide: { type: Type.NUMBER, nullable: true },
          issue: { type: Type.STRING },
        },
        required: ["issue"],
      },
    },
  },
  required: ["verdict", "findings"],
};
