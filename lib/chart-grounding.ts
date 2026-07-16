/**
 * Numeric provenance guard for charts. The model self-reports whether
 * chart numbers came from the user (isDummyData: false) or were
 * fabricated (true). That claim is a hint, never trusted: a live test
 * showed the model charting [19, 21, 23, 25] as "real" when the brief
 * contained only the 25. This module checks every plotted value against
 * the numbers actually present in the source text (brief + reference
 * doc + instruction) and overrides ungrounded "real" claims to
 * illustrative.
 *
 * Scope, stated precisely: this verifies that each VALUE appears in the
 * source, not that the value belongs to the metric, unit, label, or
 * relationship the chart claims. A brief containing $25M ARR, 40%
 * growth, and 22 months runway would ground an "ARR" chart plotting
 * [25, 40, 22]. It is a conservative guard against invented numbers,
 * not semantic grounding; the prompt rules carry the semantic burden.
 *
 * Deliberately conservative in the other direction too: a value the
 * model derived arithmetically (e.g. back-computing last year from
 * "40% growth") is not in the source text, so it stays labeled
 * illustrative. Mislabeling a real number as illustrative costs a chip;
 * mislabeling an invented number as real costs trust in a board deck.
 */

import type { ChartData } from "./types";

/**
 * Pull every numeric token out of free text. Handles the formats briefs
 * actually use: "$25M", "40%", "1,200", "21.5". Suffixes (M/B/K) are not
 * expanded: a brief that says "$25M" grounds the value 25 (series carry
 * their unit in the name), not 25,000,000.
 */
export function extractNumericTokens(text: string): Set<number> {
  const tokens = new Set<number>();
  const matches = text.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g);
  if (!matches) return tokens;
  for (const m of matches) {
    const value = Number(m.replace(/,/g, ""));
    if (Number.isFinite(value)) tokens.add(value);
  }
  return tokens;
}

/** Every plotted value in every series appears verbatim in the source. */
export function chartIsGrounded(chart: ChartData, tokens: Set<number>): boolean {
  return chart.series.every((s) => s.values.every((v) => tokens.has(v)));
}

/**
 * Values from charts the user has already accepted as real. The chart
 * editor has a "Mark as illustrative" checkbox: unticking it is an
 * explicit human confirmation, and the user is the editor of record.
 * Without this, a later revision that merely echoes a user-confirmed
 * chart would get its tag forced back on, silently overriding the
 * user's decision.
 */
export function trustedChartNumbers(
  slides: Array<{ chartData?: ChartData }>
): number[] {
  return slides.flatMap((s) =>
    s.chartData && !s.chartData.isDummyData
      ? s.chartData.series.flatMap((series) => series.values)
      : []
  );
}

/**
 * Enforce grounding across a set of slides: any chart claiming real data
 * (isDummyData: false) whose values are not all present in the source
 * text (or in `extraTrusted`, e.g. user-confirmed prior charts) is
 * overridden to illustrative. Charts already marked illustrative and
 * slides without charts pass through untouched.
 */
export function enforceChartGrounding<T extends { chartData?: ChartData }>(
  slides: T[],
  sourceText: string,
  extraTrusted: Iterable<number> = []
): T[] {
  const tokens = extractNumericTokens(sourceText);
  for (const v of extraTrusted) tokens.add(v);
  return slides.map((slide) => {
    const chart = slide.chartData;
    if (!chart || chart.isDummyData) return slide;
    if (chartIsGrounded(chart, tokens)) return slide;
    return { ...slide, chartData: { ...chart, isDummyData: true } };
  });
}
