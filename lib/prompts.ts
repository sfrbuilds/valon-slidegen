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
import { CONTEXT_DOC_CHAR_CAP, MAX_CONTEXT_DOCS } from "./types";
import { getTone, toneBlock } from "./writing-tones";
import { templateById, templateOutlineBlock, type Template } from "./deck-templates";

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
- This applies to qualitative claims as much as to numbers. Do not assert company-specific results, performance, traction, efficiency gains, or momentum as fact unless the brief supports them. A claim about how the business is doing is a business fact even when no number is attached.
- Where a specific figure or result would strengthen a slide but was not provided, write a bracketed placeholder instead, e.g. "[data needed: new-client acquisition performance]". Placeholders are expected and welcome; plausible-looking invented facts are not.
- Never infer calendar years, quarters, or dates that were not given. If the brief says "Q2" with no year, write "Q2", not "Q2 2024".
- General industry context may appear only when framed as a hypothesis, consideration, or question, never as an unsupported statement about the company itself.
- Before finalizing, re-read every heading and bullet and ask: is this stated in the brief, the reference document, or the user's instructions? Filler claims about momentum, efficiency, traction, or discipline that merely sound plausible must be deleted or rewritten as a bracketed placeholder.
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
- If the user asks to remove the illustrative tag but some plotted values were never provided by them, keep isDummyData true and use the editSummary to ask for confirmation rather than refuse flatly: name the unconfirmed values and ask the user to confirm them in chat (e.g. "yes, 23 is the actual Q1 number"). A user's confirmation of a value counts as providing it; remove the tag on their confirmation.
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
- Every text field is plain text. No markdown syntax anywhere: no **bold**, no _italics_, no backticks, no "#" heading prefixes, no leading "-" inside bullet strings. Emphasis comes from the slide design, not from markup.
- When the brief culminates in a decision or approval ask, close with a decision slide that does real work: name the decision, frame the options, and carry bracketed placeholders for whatever the brief did not provide (investment required, expected return, supporting evidence, key risks). A bare "decision required" heading is too thin.
- Add "imageIdea" only where supporting imagery genuinely helps (roughly a third of content slides): a short prompt for an abstract, editorial illustration. Never propose text, charts with numbers, screenshots, or people's faces in the imageIdea.

${CHART_DATA_SCHEMA}

Rules for "deckTitle":
- Write it as a short, natural document label (as it would appear in a file name or a deck library), 2 to 6 words, no colons or dashes, no marketing headline styling. Examples: "Q4 Investor Update Snapshot", "New Ventures Board Update", "GTM Pipeline Review Nov 2026".
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
- Every text field is plain text: no markdown syntax such as **bold** or "#" prefixes.
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
- Every text field is plain text: no markdown syntax such as **bold** or "#" prefixes.
- editSummary is a single sentence, plain language, describing the deck-wide edit. Do not overstate what was done.
`.trim();

// The reviewer model's grounding rubric. The drafting prompts carry
// FACTUAL_GROUNDING_RULES, but a drafting model self-policing is
// stochastic; this second pass checks the finished deck from outside
// against the same principles.
const EVAL_GROUNDING_RUBRIC = `
Grounding rules for the review:
- Flag any company-specific claim about results, performance, traction, targets, efficiency, momentum, market conditions, partnerships, risks, or recommendations that is not supported by the brief, reference document, or the user's instructions.
- Unsupported qualitative assertions count as ungrounded claims even when they contain no numbers.
- Bracketed placeholders such as "[data needed: ...]" are acceptable. However, flag a sentence that uses a placeholder while still asserting an unsupported conclusion, such as "[data needed: retention rate] remains strong."
- General industry context is acceptable only when framed as a hypothesis, consideration, or question. Flag it when presented as an established fact about the company.
- Faithful restatements of supported facts are grounded.
- Derived values are acceptable only when clearly labeled as calculated and the calculation follows directly from provided facts without unstated assumptions. Otherwise, flag them or require an illustrative label.
- If the source materials do not recommend a decision, flag any recommendation presented as the company's position. Presenting decision options is acceptable.
Scope limits, equally binding:
- Review the slides as they exist. Never flag missing features or unfulfilled brief instructions (such as a requested chart); the application enforces those separately, and the deck may satisfy them on a slide other than the one you are reading.
- Never flag the deck's slide count, breadth of topics, or overall structure: structure follows the template and brief the user chose. Tone rules apply to the writing on each slide, not to how many slides exist.
`.trim();

const EVAL_RESPONSE_SHAPE = `
Respond with JSON only in exactly this shape:
{ "verdict": "pass" | "needs-revision", "findings": [{ "slide": <number or omit for deck-level>, "issue": "specific problem, quoting the offending words" }] }

Findings may be tone violations or ungrounded claims.
A verdict of "pass" requires zero material findings.
List at most 6 findings, ordered by severity.
Return an empty findings array when the verdict is "pass".
`.trim();

// -------- Reusable blocks --------

function contextDocsBlock(contextDocs: ContextDoc[]): string {
  if (contextDocs.length === 0) {
    return "";
  }
  // Re-enforce both caps at the trust boundary: the upload form limits
  // count and text length in the browser, but request bodies arrive from
  // the client and could carry anything.
  const docs = contextDocs.slice(0, MAX_CONTEXT_DOCS);
  const blocks = docs.map((doc, index) => {
    const text = doc.text.slice(0, CONTEXT_DOC_CHAR_CAP);
    const truncated = doc.truncated || doc.text.length > CONTEXT_DOC_CHAR_CAP;
    const label =
      docs.length > 1
        ? `Reference document ${index + 1} of ${docs.length} ("${doc.filename}")`
        : `Reference document ("${doc.filename}")`;
    return [
      "",
      `${label} - the deck must address its content:`,
      "<document>",
      text,
      "</document>",
      truncated
        ? "Note: the document was cut off above - treat it as an excerpt, not the complete text."
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return blocks.join("\n");
}

/**
 * Format the multi-turn chat history for injection into redraft prompts.
 * Rolling summarization at high message counts to prevent context bloat.
 */
function chatHistoryBlock(history: ChatMessage[], slideId: string): string {
  if (history.length === 0) {
    return "";
  }
  // Keep only messages relevant to this slide: deck-scoped messages and
  // messages scoped to this specific slide.
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
  contextDocs: ContextDoc[];
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
    contextDocsBlock(input.contextDocs),
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
  deck: Pick<Deck, "title" | "brief" | "team" | "audience" | "contextDocs">;
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
    contextDocsBlock(input.deck.contextDocs),
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
  deck: Pick<Deck, "title" | "brief" | "team" | "audience" | "contextDocs">;
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
    contextDocsBlock(input.deck.contextDocs),
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
  deck: Pick<Deck, "title" | "team" | "audience" | "brief" | "contextDocs">;
  slides: Slide[];
  chatHistory: ChatMessage[];
}): string {
  const tone = getTone(input.deck.team, input.deck.audience);
  const slideDump = input.slides
    .map((slide, index) => {
      const header = `Slide ${index + 1} [${slide.layout}]: ${slide.heading}`;
      const sub = slide.subheading ? `  subtitle: ${slide.subheading}` : null;
      const bullets = slide.bullets.map((b) => `  - ${b}`);
      // Charts must be visible to the reviewer, or it will judge a deck
      // it cannot see (a live review flagged a chart as missing when it
      // was on the slide, represented only by its optional caption).
      // Values are still verified mechanically (lib/chart-grounding.ts);
      // this rendering is for the reviewer's situational awareness.
      const chart = slide.chartData
        ? `  chart (${slide.chartData.type}): ${slide.chartData.series
            .map((se) => `${se.name}: ${se.values.join(", ")}`)
            .join(" | ")}${slide.chartData.isDummyData ? " [labeled illustrative]" : ""}`
        : null;
      const caption = slide.chartData?.caption
        ? `  chart caption: ${slide.chartData.caption}`
        : null;
      return [header, sub, ...bullets, chart, caption].filter(Boolean).join("\n");
    })
    .join("\n");
  // Only what the user themself wrote counts as a grounding source;
  // assistant messages are the same model whose claims are under review.
  const userMessages = input.chatHistory.filter((m) => m.role === "user");
  const userInstructionsBlock =
    userMessages.length > 0
      ? [
          "",
          "The user's own instructions and confirmations from the revision chat (facts stated here count as provided):",
          ...userMessages.map((m) => `- ${m.content}`),
        ].join("\n")
      : "";
  return [
    "You are Valon's deck reviewer. Judge two things: whether this drafted deck follows the required tone, and whether its claims are grounded in the brief, the reference documents, and the user's instructions. Flag only clear, material violations; do not flag reasonable stylistic choices that a competent writer could defend. Be specific; vague praise helps no one.",
    "",
    `Deck: "${input.deck.title}" (team: ${input.deck.team}, audience: ${input.deck.audience}).`,
    `Brief: ${input.deck.brief}`,
    contextDocsBlock(input.deck.contextDocs),
    userInstructionsBlock,
    "",
    toneBlock(tone),
    "",
    EVAL_GROUNDING_RUBRIC,
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
