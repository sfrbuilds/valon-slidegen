/**
 * Prompt composition for Valon SlideGen v0.
 *
 * Every prompt sent to Gemini is built here. Nothing hidden, no appendices,
 * no in-line concatenation elsewhere in the app. If a prompt changes, it
 * changes in this file.
 *
 * Architecture: draft / redraft / eval prompts share an identity line, a
 * tone block, and (optionally) a context document block. Redraft additionally
 * includes the multi-turn chat history so the model has the full
 * conversation context on every revision.
 */

import type {
  Audience,
  ChatMessage,
  ContextDoc,
  Deck,
  Slide,
  Team,
} from "./types";
import { CONTEXT_DOC_CHAR_CAP } from "./types";
import { getTone, toneBlock } from "./tones";
import { templateById, templateOutlineBlock, type Template } from "./templates";

// -------- Constants: identity, brand style, response shapes --------

export const IDENTITY_LINE =
  "You are Valon's presentation writer. Valon is an AI-native operating system for regulated finance, starting with mortgage servicing. Decks are professional, editorial, and warm.";

// Included in every drafting and revision prompt. Fabricated business
// facts in a board deck are the product's worst failure mode; prose
// cannot be mechanically verified the way chart values are (see
// lib/chart-grounding.ts), so the prompt is the only line of defense.
export const FACTUAL_GROUNDING_RULES = `
Factual grounding, non-negotiable:
- Never invent specific business facts: metrics, percentages, dollar figures, growth rates, dates, client or partner names, or outcomes that are not stated in the brief, the reference document, or the user's instructions.
- Where a specific figure would strengthen a slide but was not provided, write a bracketed placeholder instead, e.g. "[data needed: new-client acquisition performance]". Placeholders are expected and welcome; plausible-looking invented numbers are not.
- Never infer calendar years, quarters, or dates that were not given. If the brief says "Q2" with no year, write "Q2", not "Q2 2024".
- General, non-numeric industry context is fine; specific invented figures are not.
`.trim();

export const BRAND_STYLE_LAYER = `
Style: warm editorial fintech aesthetic. Palette anchored in deep brown-ink
(#141210) on warm cream and white paper (#F6F1EA, #FFFFFF), with a single
gold accent (#D89A4E) used sparingly - a line, a numeral, or a small
sunburst motif. Generous white space, flat editorial illustration or minimal
abstract geometry, warm and premium, never clip art, never stock-photo
cliches, never cool grays or blues, never more than one gold element per
composition.
Do not render any text, words, letters, or numbers inside the image.
`.trim();

const CHART_DATA_SCHEMA = `
Chart primitive (available on content slides):
"chartData": {
  "type": "bar" | "line",
  "labels": ["Q1", "Q2", "Q3", "Q4"],
  "series": [{ "name": "AUM ($B)", "values": [40, 55, 68, 72] }],
  "caption": "optional short caption below chart",
  "yAxisLabel": "optional y-axis label",
  "isDummyData": true | false
}
Rules for charts:
- "isDummyData" may be false ONLY when EVERY plotted value is explicitly present in the brief or the reference document. If even one value in the series is inferred, interpolated, back-computed, or invented, set isDummyData to true. A brief containing SOME figures is not license to mark a whole series as real.
- The application independently verifies every plotted value against the brief and reference document and overrides false claims, so misreporting provenance only produces an inconsistent deck.
- When the brief provides only part of a series, either chart only the provided values or fabricate the rest and set isDummyData to true.
- Use "bar" for discrete categories (quarters, segments, cohorts) and "line" for continuous trends over time.
- Labels and each series' values must have equal length.
- Series "name" should carry the unit (e.g. "AUM ($B)", "Loans processed (K)", "Growth (%)"), not just the metric. This is what renders in the tooltip and, for multi-series, in the legend.
- ALWAYS include "yAxisLabel" with a short unit label (e.g. "$B", "% MoM", "loans"). The y-axis is unlabeled without it.
- ALWAYS include a short "caption" that puts the chart in one sentence of context ("Illustrative quarterly AUM growth"). The caption renders below the chart.
- Prefer 3 to 6 data points per series. Too few looks thin, too many crowds the value labels rendered above each bar.
- chartData is an alternative to imageIdea on the same slide. Do not include both.
- Only include chartData when the story is quantitative and a chart materially adds to the message. Do not attach charts to editorial or narrative slides.
- Never claim to have added a chart in an editSummary unless chartData is actually present in the response.
`.trim();

// Forcing directives, appended by the prompt builders when the caller
// detects explicit chart intent (see lib/chart-intent.ts). They live here,
// not in the routes, so every word sent to the model stays in this file.

const CHART_FORCING_DIRECTIVE_DRAFT = `
CRITICAL: The brief explicitly asks for a chart, graph, or data visualization.
At least ONE content slide in this deck MUST include a "chartData" object populated with real numeric values.
Set "isDummyData": false ONLY if every plotted value comes from the brief or reference document.
If any value must be fabricated, fabricate a directionally reasonable series and set "isDummyData": true so the UI can flag them as illustrative.
Do not describe the chart in bullets or imageIdea instead. Return actual chartData.
`.trim();

const CHART_FORCING_DIRECTIVE_REDRAFT = `
CRITICAL: The user's instruction explicitly asks for a chart, graph, or data visualization.
You MUST include a "chartData" object in your response, populated with real values.
Set "isDummyData": false ONLY if every plotted value was provided in the brief, context document, or the user's own chat messages. Otherwise fabricate a directionally reasonable series and set "isDummyData": true.
Do not describe the chart in bullets or imageIdea instead. Return actual chartData.
`.trim();

const DRAFT_RESPONSE_SHAPE = `
Respond with JSON only (no markdown fences, no commentary) in exactly this shape:
{
  "deckTitle": "string",
  "slides": [
    { "layout": "title", "heading": "deck title", "subheading": "optional subtitle" },
    { "layout": "content", "heading": "string", "bullets": ["string", ...], "imageIdea": "optional", "chartData": <optional, see schema> },
    { "layout": "section", "heading": "one big statement" }
  ]
}
Rules for the shape:
- "layout" must be exactly one of: "title", "content", "section".
- For multi-slide decks, the first slide must use the "title" layout, and "section" should appear sparingly as a divider or closer.
- For a single-slide deck, use the "content" layout with the actual message (heading plus 2-5 bullets). Do not use "title" for a one-slide deck.
- Content slides carry 2-5 tight bullets. Never paragraph-length bullets.
- Add "imageIdea" only where supporting imagery genuinely helps (roughly a third of content slides): a short prompt for an abstract, editorial illustration. Never propose text, charts with numbers, screenshots, or people's faces in the imageIdea.

${CHART_DATA_SCHEMA}

Rules for "deckTitle":
- Write it as a short, natural document label (as it would appear in a file name or a deck library), 2 to 6 words, no colons or dashes, no marketing headline styling. Examples: "Q4 Investor Update Snapshot", "New Ventures Board Read", "GTM Pipeline Review Nov 2026".
- For a single-slide deck, deckTitle should read as a short document name distinct from the slide's own heading. Never leave it mid-phrase or truncated.
`.trim();

const REDRAFT_RESPONSE_SHAPE = `
Respond with JSON only (no markdown fences, no commentary) in exactly this shape:
{
  "slide": { layout, heading, subheading?, bullets, imageIdea?, chartData? (see schema in the draft rules) },
  "editSummary": "one sentence describing what changed and why"
}
Rules:
- "layout" must remain the same as the current slide unless the instruction explicitly requires changing it.
- If the user asks for a chart, graph, trend, or data visualization: return chartData in the response. Do not describe a chart in bullets or imageIdea without also returning real chartData. Do not claim to have added a chart in editSummary unless chartData is present in the response.
- If chartData is fabricated (numbers not given in the brief or context doc), you MUST set isDummyData to true so the UI marks it as illustrative.
- If the slide currently has chartData or an imageIdea and the instruction does not concern it, return it unchanged.
- If the user asks to REMOVE the chart, return the slide with chartData set to null. If the user asks to REMOVE the image, return the slide with imageIdea set to null. Say so in the editSummary.
- editSummary is a single sentence, plain language, describing the specific edit (what changed, why). Not a restatement of the instruction. Do not overstate what was done.
`.trim();

const DECK_REDRAFT_RESPONSE_SHAPE = `
Respond with JSON only (no markdown fences, no commentary) in exactly this shape:
{
  "slides": [ { sourceSlideId, layout, heading, subheading?, bullets, imageIdea?, chartData? (see schema in the draft rules) }, ... ],
  "editSummary": "one sentence describing what changed across the deck and why"
}
Rules:
- Return the FULL deck: every slide, in order, including slides you did not change. Unchanged slides must be returned verbatim.
- Every slide in the current deck carries a "sourceSlideId". Echo it UNCHANGED on the slide that derives from it, even if you rewrote the content. This is how the app preserves slide identity.
- For a brand-new slide you added, set sourceSlideId to null. Never invent a sourceSlideId and never use the same sourceSlideId on two slides.
- Keep the same number of slides and the same layouts unless the instruction explicitly requires adding, removing, or restructuring slides.
- Apply the instruction wherever it is relevant; leave everything else untouched. Do not rewrite slides gratuitously.
- Preserve each slide's existing chartData and imageIdea unless the instruction concerns them. If the user asks to remove a chart or image, set that field to null on the relevant slide(s).
- If chartData is fabricated (numbers not given in the brief or context doc), set isDummyData to true.
- editSummary is a single sentence, plain language, describing the deck-wide edit. Do not overstate what was done.
`.trim();

const EVAL_RESPONSE_SHAPE = `
Respond with JSON only (no markdown fences, no commentary) in exactly this shape:
{ "verdict": "on-brand" | "needs-revision", "findings": [{ "slide": <number or omit for deck-level>, "issue": "specific problem, quoting the offending words" }] }
Verdict "on-brand" requires zero material tone violations. List at most 6 findings, most severe first. An empty findings array is required when the verdict is "on-brand".
`.trim();

// -------- Reusable blocks --------

function contextDocBlock(contextDoc: ContextDoc | null): string {
  if (!contextDoc) {
    return "";
  }
  // Re-enforce the cap at the trust boundary. The /api/extract endpoint
  // caps uploads, but downstream call bodies arrive from the client and
  // could carry anything.
  const text = contextDoc.text.slice(0, CONTEXT_DOC_CHAR_CAP);
  const truncated =
    contextDoc.truncated || contextDoc.text.length > CONTEXT_DOC_CHAR_CAP;
  return [
    "",
    `Reference document ("${contextDoc.filename}") - the deck must address its content:`,
    "<document>",
    text,
    "</document>",
    truncated
      ? "Note: the document was cut off above - treat it as an excerpt, not the complete text."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format the multi-turn chat history for injection into redraft prompts.
 * Rolling summarization at high message counts to prevent context bloat.
 */
function chatHistoryBlock(history: ChatMessage[], slideId: string): string {
  if (history.length === 0) {
    return "";
  }
  // Filter to messages relevant to this slide (deck-scoped + this slide-scoped)
  const relevant = history.filter(
    (m) => m.scope === "deck" || (m.scope === "slide" && m.slideId === slideId)
  );
  if (relevant.length === 0) {
    return "";
  }
  const lines = ["", "Prior conversation on this deck / slide:"];
  const MAX_TURNS = 20; // truncate before oldest if longer
  const messages =
    relevant.length > MAX_TURNS ? relevant.slice(-MAX_TURNS) : relevant;
  if (relevant.length > MAX_TURNS) {
    lines.push(
      `(${relevant.length - MAX_TURNS} earlier messages summarized as: initial deck was drafted and iterated; oldest messages omitted for brevity.)`
    );
  }
  for (const m of messages) {
    const label = m.role === "user" ? "User" : "Assistant";
    const scope = m.scope === "deck" ? "(deck)" : "(slide)";
    const editHint = m.editSummary ? ` [${m.editSummary}]` : "";
    lines.push(`- ${label} ${scope}: ${m.content}${editHint}`);
  }
  return lines.join("\n");
}

// -------- Prompt builders --------

export function buildDraftPrompt(input: {
  brief: string;
  team: Team;
  audience: Audience;
  // null = freeform: the model sizes the deck from the brief. Users who
  // structure the brief themselves ("6 slides: slide 1..., slide 2...")
  // must never have that concept bulldozed by a forced count.
  targetLength: number | null;
  contextDoc: ContextDoc | null;
  templateId?: string | null;
  // A custom (user-saved) template, already validated by
  // parseCustomTemplate at the route. Overrides the built-in id lookup:
  // custom templates only exist in the browser, so the server receives
  // the whole object instead of a resolvable id.
  customTemplate?: Template | null;
  forceChart?: boolean;
}): string {
  const tone = getTone(input.team, input.audience);
  const template = input.customTemplate ?? templateById(input.templateId ?? null);
  const templateBlock = template ? templateOutlineBlock(template) : "";
  const lengthGuidance = template
    ? `Aim for ${template.outline.length} slides, matching the template structure. Adjust by no more than a slide or two.`
    : input.targetLength !== null
      ? `Produce exactly ${input.targetLength} slides.`
      : "Choose the slide count that best serves the brief. If the brief specifies a number of slides or a slide-by-slide structure, follow it exactly. Otherwise favor a tight deck over a padded one.";
  return [
    IDENTITY_LINE,
    "",
    template
      ? `Draft a "${template.name}" deck for the ${input.team} team, ${input.audience} audience.`
      : input.targetLength !== null
        ? `Draft a complete ${input.targetLength}-slide presentation for the ${input.team} team, ${input.audience} audience.`
        : `Draft a complete presentation for the ${input.team} team, ${input.audience} audience.`,
    "",
    "Brief:",
    input.brief,
    contextDocBlock(input.contextDoc),
    templateBlock,
    "",
    toneBlock(tone),
    "",
    FACTUAL_GROUNDING_RULES,
    "",
    DRAFT_RESPONSE_SHAPE,
    "",
    lengthGuidance,
    ...(input.forceChart ? ["", CHART_FORCING_DIRECTIVE_DRAFT] : []),
  ].join("\n");
}

export function buildRedraftPrompt(input: {
  deck: Pick<Deck, "title" | "brief" | "team" | "audience" | "contextDoc">;
  slide: Slide;
  slideNumber: number;
  totalSlides: number;
  instruction: string;
  neighborHeadings: string[];
  chatHistory: ChatMessage[];
  forceChart?: boolean;
}): string {
  const tone = getTone(input.deck.team, input.deck.audience);
  return [
    IDENTITY_LINE,
    "",
    `You are revising one slide of an existing deck.`,
    "",
    `Deck: "${input.deck.title}" (team: ${input.deck.team}, audience: ${input.deck.audience}).`,
    "Original brief:",
    input.deck.brief,
    contextDocBlock(input.deck.contextDoc),
    "",
    toneBlock(tone),
    "",
    `Slide ${input.slideNumber} of ${input.totalSlides} currently reads:`,
    JSON.stringify(
      {
        layout: input.slide.layout,
        heading: input.slide.heading,
        subheading: input.slide.subheading,
        bullets: input.slide.bullets,
        imageIdea: input.slide.imageIdea,
        chartData: input.slide.chartData,
      },
      null,
      2
    ),
    "",
    `Surrounding slide headings (do not duplicate them): ${input.neighborHeadings.join(" | ") || "none"}`,
    chatHistoryBlock(input.chatHistory, input.slide.id),
    "",
    `Revision instruction from the author: ${input.instruction}`,
    "",
    FACTUAL_GROUNDING_RULES,
    "",
    CHART_DATA_SCHEMA,
    "",
    REDRAFT_RESPONSE_SHAPE,
    ...(input.forceChart ? ["", CHART_FORCING_DIRECTIVE_REDRAFT] : []),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildDeckRedraftPrompt(input: {
  deck: Pick<Deck, "title" | "brief" | "team" | "audience" | "contextDoc">;
  slides: Slide[];
  instruction: string;
  chatHistory: ChatMessage[];
  forceChart?: boolean;
}): string {
  const tone = getTone(input.deck.team, input.deck.audience);
  const slidesJson = JSON.stringify(
    input.slides.map((s) => ({
      sourceSlideId: s.id,
      layout: s.layout,
      heading: s.heading,
      subheading: s.subheading,
      bullets: s.bullets,
      imageIdea: s.imageIdea,
      chartData: s.chartData,
    })),
    null,
    2
  );
  // Deck-scoped history only: slide threads are noise at deck level.
  const deckHistory = input.chatHistory.filter((m) => m.scope === "deck");
  return [
    IDENTITY_LINE,
    "",
    "You are revising an existing deck as a whole.",
    "",
    `Deck: "${input.deck.title}" (team: ${input.deck.team}, audience: ${input.deck.audience}).`,
    "Original brief:",
    input.deck.brief,
    contextDocBlock(input.deck.contextDoc),
    "",
    toneBlock(tone),
    "",
    `The deck currently has ${input.slides.length} slides:`,
    slidesJson,
    chatHistoryBlock(deckHistory, ""),
    "",
    `Revision instruction from the author (applies to the whole deck): ${input.instruction}`,
    "",
    FACTUAL_GROUNDING_RULES,
    "",
    CHART_DATA_SCHEMA,
    "",
    DECK_REDRAFT_RESPONSE_SHAPE,
    ...(input.forceChart ? ["", CHART_FORCING_DIRECTIVE_REDRAFT] : []),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildEvalPrompt(input: {
  deck: Pick<Deck, "title" | "team" | "audience" | "brief" | "contextDoc">;
  slides: Slide[];
}): string {
  const tone = getTone(input.deck.team, input.deck.audience);
  const slideDump = input.slides
    .map((slide, index) => {
      const header = `Slide ${index + 1} [${slide.layout}]: ${slide.heading}`;
      const sub = slide.subheading ? `  subtitle: ${slide.subheading}` : null;
      const bullets = slide.bullets.map((b) => `  - ${b}`);
      return [header, sub, ...bullets].filter(Boolean).join("\n");
    })
    .join("\n");
  return [
    "You are Valon's brand reviewer. Judge whether this drafted deck follows the required tone. Flag only clear, material violations of the tone rules; do not flag reasonable stylistic choices that a competent writer could defend. Be specific; vague praise helps no one.",
    "",
    `Deck: "${input.deck.title}" (team: ${input.deck.team}, audience: ${input.deck.audience}).`,
    `Brief: ${input.deck.brief}`,
    input.deck.contextDoc
      ? `The deck must address the reference document "${input.deck.contextDoc.filename}".`
      : "",
    "",
    toneBlock(tone),
    "",
    "The deck:",
    slideDump,
    "",
    EVAL_RESPONSE_SHAPE,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildImagePrompt(userPrompt: string): string {
  return [
    userPrompt.trim(),
    "",
    BRAND_STYLE_LAYER,
  ].join("\n");
}
