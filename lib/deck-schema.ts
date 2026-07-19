/**
 * Validate untrusted JSON at the boundary: Gemini responses, plus the
 * one client-supplied structure the server must trust-check (custom
 * templates arriving in draft request bodies). Nothing from either
 * source becomes app state or prompt input without passing through here.
 */

import type {
  Audience,
  ChartData,
  ChartType,
  EvalFinding,
  EvalVerdict,
  Slide,
  SlideLayout,
  Team,
} from "./types";
import { AUDIENCES, CHART_TYPES, EVAL_VERDICTS, SLIDE_LAYOUTS, TEAMS, makeId } from "./types";
import type { Template, TemplateOutlineSlide } from "./templates";
import { TEMPLATE_LIMITS } from "./templates";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Strip common wrappers like markdown code fences and prose intros
 * ("Here is the JSON: ..."). Returns the inner JSON string.
 */
export function stripCodeFences(raw: string): string {
  let text = raw.trim();
  // Remove markdown code fences
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch) text = fenceMatch[1].trim();
  // If wrapped in prose, extract the outermost brace-block
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace > 0 || (firstBrace >= 0 && lastBrace > firstBrace)) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

/**
 * Strip inline markdown the model sometimes emits despite the plain-text
 * rule in the prompts ("**Expand Market Reach:**" rendered literally in
 * the preview and the .pptx). Paired emphasis markers and heading
 * prefixes are removed; lone asterisks in real copy are left alone.
 */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold**
    .replace(/__(.+?)__/g, "$1") // __bold__
    .replace(/`([^`]+)`/g, "$1") // `code`
    .replace(/^#{1,6}\s+/, "") // "# Heading" prefix
    .replace(/^[-*]\s+/, "") // "- bullet" prefix inside a bullet string
    .trim();
}

export type DraftedSlide = {
  layout: SlideLayout;
  heading: string;
  subheading?: string;
  bullets: string[];
  imageIdea?: string;
  chartData?: ChartData;
  // Deck-redraft only: echoes the id of the existing slide this one
  // derives from, so the merge can preserve identity when the model
  // inserts, removes, or reorders slides. Absent on fresh drafts.
  sourceSlideId?: string;
};

/**
 * Strict chart validation. The whole chart is dropped (returns undefined)
 * when anything is structurally wrong: unknown type, non-string labels,
 * non-numeric values, or any series whose length differs from the labels.
 * Filtering out individual bad entries would silently shift values onto
 * the wrong labels, which is worse than no chart.
 */
function parseChartData(raw: unknown): ChartData | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const c = raw as Record<string, unknown>;
  const type = c.type;
  if (typeof type !== "string" || !(CHART_TYPES as readonly string[]).includes(type)) {
    return undefined;
  }
  if (!Array.isArray(c.labels) || c.labels.length === 0) return undefined;
  if (!(c.labels as unknown[]).every((l): l is string => typeof l === "string")) {
    return undefined;
  }
  const labels = c.labels as string[];
  if (!Array.isArray(c.series) || c.series.length === 0) return undefined;
  const series: { name: string; values: number[] }[] = [];
  for (const s of c.series as unknown[]) {
    if (typeof s !== "object" || s === null) return undefined;
    const sr = s as Record<string, unknown>;
    const name = typeof sr.name === "string" ? sr.name : "Series";
    if (!Array.isArray(sr.values)) return undefined;
    const values = (sr.values as unknown[]).map((v) =>
      typeof v === "number" ? v : Number(v)
    );
    if (values.some((v) => !Number.isFinite(v))) return undefined;
    if (values.length !== labels.length) return undefined;
    series.push({ name, values });
  }
  return {
    type: type as ChartType,
    labels,
    series,
    caption: typeof c.caption === "string" ? c.caption : undefined,
    yAxisLabel: typeof c.yAxisLabel === "string" ? c.yAxisLabel : undefined,
    isDummyData: c.isDummyData !== false, // default to true if the model omits
  };
}

export type DraftedDeck = {
  deckTitle: string;
  slides: DraftedSlide[];
};

function isSlideLayout(x: unknown): x is SlideLayout {
  return typeof x === "string" && (SLIDE_LAYOUTS as readonly string[]).includes(x);
}

export function parseDeckDraft(raw: string): ParseResult<DraftedDeck> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch (e) {
    return { ok: false, error: `Model returned invalid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Response is not a JSON object." };
  }
  const p = parsed as Record<string, unknown>;
  const deckTitle = typeof p.deckTitle === "string" && p.deckTitle.trim()
    ? stripInlineMarkdown(p.deckTitle)
    : "Untitled deck";
  if (!Array.isArray(p.slides) || p.slides.length === 0) {
    return { ok: false, error: "Response has no slides array." };
  }
  const slides: DraftedSlide[] = [];
  for (let i = 0; i < p.slides.length; i++) {
    const s = p.slides[i] as Record<string, unknown>;
    if (!isSlideLayout(s.layout)) {
      return { ok: false, error: `Slide ${i + 1} has invalid layout "${String(s.layout)}"` };
    }
    const heading = typeof s.heading === "string" && s.heading.trim()
      ? stripInlineMarkdown(s.heading)
      : "Untitled slide";
    const subheading = typeof s.subheading === "string" ? stripInlineMarkdown(s.subheading) : undefined;
    const bullets = Array.isArray(s.bullets)
      ? (s.bullets as unknown[])
          .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
          .map(stripInlineMarkdown)
      : [];
    const imageIdea = typeof s.imageIdea === "string" ? s.imageIdea.trim() : undefined;
    const chartData = parseChartData(s.chartData);
    slides.push({ layout: s.layout, heading, subheading, bullets, imageIdea, chartData });
  }
  return { ok: true, value: { deckTitle, slides } };
}

export function parseSlideRedraft(
  raw: string
): ParseResult<{ slide: DraftedSlide; editSummary: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch (e) {
    return { ok: false, error: `Model returned invalid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Response is not a JSON object." };
  }
  const p = parsed as Record<string, unknown>;
  const slideRaw = p.slide as Record<string, unknown> | undefined;
  if (!slideRaw || !isSlideLayout(slideRaw.layout)) {
    return { ok: false, error: "Response is missing a valid slide object." };
  }
  const heading = typeof slideRaw.heading === "string" && slideRaw.heading.trim()
    ? stripInlineMarkdown(slideRaw.heading)
    : "Untitled slide";
  const subheading = typeof slideRaw.subheading === "string" ? stripInlineMarkdown(slideRaw.subheading) : undefined;
  const bullets = Array.isArray(slideRaw.bullets)
    ? (slideRaw.bullets as unknown[])
        .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
        .map(stripInlineMarkdown)
    : [];
  const imageIdea = typeof slideRaw.imageIdea === "string" ? slideRaw.imageIdea.trim() : undefined;
  const chartData = parseChartData(slideRaw.chartData);
  const editSummary = typeof p.editSummary === "string" && p.editSummary.trim()
    ? p.editSummary.trim()
    : "Slide revised.";
  return {
    ok: true,
    value: {
      slide: { layout: slideRaw.layout, heading, subheading, bullets, imageIdea, chartData },
      editSummary,
    },
  };
}

/**
 * Parse a whole-deck redraft response: full slides array + editSummary.
 */
export function parseDeckRedraft(
  raw: string
): ParseResult<{ slides: DraftedSlide[]; editSummary: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch (e) {
    return { ok: false, error: `Model returned invalid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Response is not a JSON object." };
  }
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.slides) || p.slides.length === 0) {
    return { ok: false, error: "Response has no slides array." };
  }
  const slides: DraftedSlide[] = [];
  for (let i = 0; i < p.slides.length; i++) {
    const s = p.slides[i] as Record<string, unknown>;
    if (!isSlideLayout(s.layout)) {
      return { ok: false, error: `Slide ${i + 1} has invalid layout "${String(s.layout)}"` };
    }
    const heading = typeof s.heading === "string" && s.heading.trim()
      ? stripInlineMarkdown(s.heading)
      : "Untitled slide";
    const subheading = typeof s.subheading === "string" ? stripInlineMarkdown(s.subheading) : undefined;
    const bullets = Array.isArray(s.bullets)
      ? (s.bullets as unknown[])
          .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
          .map(stripInlineMarkdown)
      : [];
    const imageIdea = typeof s.imageIdea === "string" ? s.imageIdea.trim() : undefined;
    const chartData = parseChartData(s.chartData);
    const sourceSlideId =
      typeof s.sourceSlideId === "string" && s.sourceSlideId.trim()
        ? s.sourceSlideId.trim()
        : undefined;
    slides.push({ layout: s.layout, heading, subheading, bullets, imageIdea, chartData, sourceSlideId });
  }
  const editSummary = typeof p.editSummary === "string" && p.editSummary.trim()
    ? p.editSummary.trim()
    : "Deck revised.";
  return { ok: true, value: { slides, editSummary } };
}

/**
 * Parse a deck-review (eval) response: verdict + findings.
 */
export function parseEvalResult(
  raw: string
): ParseResult<{ verdict: EvalVerdict; findings: EvalFinding[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch (e) {
    return { ok: false, error: `Model returned invalid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Response is not a JSON object." };
  }
  const p = parsed as Record<string, unknown>;
  const verdict =
    typeof p.verdict === "string" &&
    (EVAL_VERDICTS as readonly string[]).includes(p.verdict)
      ? (p.verdict as EvalVerdict)
      : null;
  if (!verdict) {
    return { ok: false, error: `Invalid verdict "${String(p.verdict)}"` };
  }
  const findings: EvalFinding[] = Array.isArray(p.findings)
    ? (p.findings as unknown[])
        .map((f) => {
          if (typeof f !== "object" || f === null) return null;
          const fr = f as Record<string, unknown>;
          const issue = typeof fr.issue === "string" ? fr.issue.trim() : "";
          if (!issue) return null;
          const slideNumber =
            typeof fr.slide === "number" && Number.isFinite(fr.slide)
              ? fr.slide
              : null;
          return { slideNumber, issue };
        })
        .filter((f): f is EvalFinding => f !== null)
        .slice(0, 6)
    : [];
  return { ok: true, value: { verdict, findings } };
}

/**
 * Validate a custom template arriving in a draft request body. Custom
 * templates live in the browser's localStorage, which the server cannot
 * see, so the client ships the whole object and it gets the same
 * trust-boundary treatment as model output. Structural problems reject
 * (unknown layout, missing heading, oversized outline); overlong text
 * degrades by truncation to TEMPLATE_LIMITS, because user-authored
 * template text is injected into the draft prompt.
 */
export function parseCustomTemplate(raw: unknown): ParseResult<Template> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Custom template is not an object." };
  }
  const t = raw as Record<string, unknown>;
  const name =
    typeof t.name === "string" ? t.name.trim().slice(0, TEMPLATE_LIMITS.name) : "";
  if (!name) return { ok: false, error: "Custom template has no name." };
  if (!Array.isArray(t.outline) || t.outline.length === 0) {
    return { ok: false, error: "Custom template has no outline." };
  }
  if (t.outline.length > TEMPLATE_LIMITS.outlineMax) {
    return {
      ok: false,
      error: `Custom template outline exceeds ${TEMPLATE_LIMITS.outlineMax} slides.`,
    };
  }
  const outline: TemplateOutlineSlide[] = [];
  for (let i = 0; i < t.outline.length; i++) {
    const s = t.outline[i] as Record<string, unknown> | null;
    if (typeof s !== "object" || s === null || !isSlideLayout(s.layout)) {
      return { ok: false, error: `Outline slide ${i + 1} has an invalid layout.` };
    }
    const heading =
      typeof s.heading === "string" && s.heading.trim()
        ? s.heading.trim().slice(0, TEMPLATE_LIMITS.heading)
        : "";
    if (!heading) {
      return { ok: false, error: `Outline slide ${i + 1} has no heading.` };
    }
    const hint =
      typeof s.hint === "string" ? s.hint.trim().slice(0, TEMPLATE_LIMITS.hint) : "";
    outline.push({ layout: s.layout, heading, hint });
  }
  // defaultTeam/defaultAudience are picker conveniences the draft prompt
  // never reads (team/audience arrive separately on the request), so
  // invalid values degrade to defaults rather than rejecting the draft.
  const defaultTeam: Team =
    typeof t.defaultTeam === "string" && (TEAMS as readonly string[]).includes(t.defaultTeam)
      ? (t.defaultTeam as Team)
      : "new-ventures";
  const defaultAudience: Audience =
    typeof t.defaultAudience === "string" &&
    (AUDIENCES as readonly string[]).includes(t.defaultAudience)
      ? (t.defaultAudience as Audience)
      : "internal";
  return {
    ok: true,
    value: {
      id: typeof t.id === "string" && t.id.trim() ? t.id.trim().slice(0, 80) : "custom",
      name,
      description:
        typeof t.description === "string"
          ? t.description.trim().slice(0, TEMPLATE_LIMITS.description)
          : "",
      defaultTeam,
      defaultAudience,
      targetLength: outline.length,
      outline,
    },
  };
}

/**
 * Convert DraftedSlide (from AI, no id yet) to full Slide with id.
 */
export function toSlide(drafted: DraftedSlide): Slide {
  return {
    id: makeId("slide"),
    layout: drafted.layout,
    heading: drafted.heading,
    subheading: drafted.subheading,
    bullets: drafted.bullets,
    imageIdea: drafted.imageIdea,
    chartData: drafted.chartData,
  };
}
