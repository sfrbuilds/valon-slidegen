/**
 * Chart / visual intent detection shared by the draft and redraft routes.
 *
 * Design notes:
 * - The regexes are deliberately narrow. Earlier versions matched /graph/
 *   (which hits "paragraph") and /\bbar\b/ (which hits "raise the bar"),
 *   silently forcing charts onto unrelated edits. Every pattern here
 *   requires an unambiguous chart word or a metric-cadence acronym.
 * - "MoM" is matched case-sensitively so the word "mom" never triggers it.
 * - Detection is a *hint*, not an enforcer. Routes use it to (a) build the
 *   prompt with `forceChart: true` and (b) retry once when the model
 *   returns no chart. A miss after retry degrades to a warning, never a
 *   failed request; a good deck is never discarded over a missing chart.
 */

export const CHART_INTENT_PATTERNS: RegExp[] = [
  /\bchart\b/i,
  /\bgraphs?\b/i, // word-bounded: does not match "paragraph"
  /\bplot\b/i,
  /visuali[sz]ation/i,
  /\bbar (chart|graph)\b/i,
  /\bline (chart|graph)\b/i,
  /\btrend ?line\b/i,
  /\bqoq\b/i,
  /quarter[- ]over[- ]quarter/i,
  /\bMoM\b/, // case-sensitive: "mom" must not trigger chart forcing
  /month[- ]over[- ]month/i,
  /\byoy\b/i,
  /year[- ]over[- ]year/i,
  /\bhistogram\b/i,
];

export function detectsChartIntent(text: string): boolean {
  return CHART_INTENT_PATTERNS.some((re) => re.test(text));
}

// -------- Removal intent --------
//
// The redraft route preserves an existing chart/image when the model omits
// it (models are lazy about echoing unchanged fields). That fallback would
// make "remove the chart" impossible via chat, so removal intent is
// detected explicitly: when present, the model's omission is honored as a
// deliberate clear instead of falling back to the existing visual.

const REMOVE_VERBS = /\b(remove|delete|drop|clear|get rid of|take (out|off|away)|lose|ditch|kill|scrap|no more)\b/i;

export function detectsChartRemoval(text: string): boolean {
  return REMOVE_VERBS.test(text) && /\b(chart|graph|plot|visuali[sz]ation|data table)\b/i.test(text);
}

export function detectsImageRemoval(text: string): boolean {
  return REMOVE_VERBS.test(text) && /\b(image|illustration|picture|photo|artwork|visual)\b/i.test(text);
}

// Note: the forcing directives themselves live in lib/prompts.ts (builders
// accept a `forceChart` option). This module only decides WHEN to force.

/** User-facing warning when the model still returned no chart after a retry. */
export const CHART_MISS_WARNING =
  "A chart was requested but the model didn't produce one, even after a retry. The rest of the edit was applied. Use '+ Add chart' below the slide to add one manually.";
