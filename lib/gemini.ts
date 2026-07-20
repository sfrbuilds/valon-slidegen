/**
 * Gemini client wrapper. Centralizes model choice and response extraction.
 */

import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

export function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY in your local environment.");
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

// Defaults are the current STABLE models (July 2026): preview models
// carry tighter rate limits and deprecation windows, which is the wrong
// trade for a tool meant to run reliably. Both are env-overridable.
export function textModel(): string {
  return process.env.GOOGLE_TEXT_MODEL || "gemini-3.5-flash";
}

export function imageModel(): string {
  return process.env.GOOGLE_IMAGE_MODEL || "gemini-3.1-flash-image";
}

/**
 * Extract the first text response from a Gemini generateContent result.
 * Handles the various response shapes Gemini returns.
 */
export function responseText(response: unknown): string {
  const r = response as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const parts = (r.candidates ?? []).flatMap(
    (candidate) => candidate.content?.parts ?? []
  );
  return parts
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text?.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Extract the first image from a Gemini generateContent result.
 * Returns null if no image was returned.
 */
export function responseImage(response: unknown): {
  data: string;
  mimeType: string;
} | null {
  const r = response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
    }>;
  };
  const parts = (r.candidates ?? []).flatMap(
    (candidate) => candidate.content?.parts ?? []
  );
  const imagePart = parts.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
    return null;
  }
  return {
    data: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}
