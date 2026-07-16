/**
 * Chart provenance verification. The model self-reports whether chart
 * numbers came from the user (isDummyData: false) or were fabricated
 * (true). That claim is a hint, never trusted: a live test showed the
 * model charting [19, 21, 23, 25] as "real" when the brief contained
 * only the 25. This module checks every plotted value against the
 * numbers actually present in the source text (brief + reference doc +
 * instruction) and overrides ungrounded "real" claims to illustrative.
 *
 * Deliberately conservative: a value the model derived arithmetically
 * (e.g. back-computing last year from "40% growth") is not in the
 * source text, so it stays labeled illustrative. Mislabeling a real
 * number as illustrative costs a chip; mislabeling an invented number
 * as real costs trust in a board deck.
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
 * Enforce grounding across a set of slides: any chart claiming real data
 * (isDummyData: false) whose values are not all present in the source
 * text is overridden to illustrative. Charts already marked illustrative
 * and slides without charts pass through untouched.
 */
export function enforceChartGrounding<T extends { chartData?: ChartData }>(
  slides: T[],
  sourceText: string
): T[] {
  const tokens = extractNumericTokens(sourceText);
  return slides.map((slide) => {
    const chart = slide.chartData;
    if (!chart || chart.isDummyData) return slide;
    if (chartIsGrounded(chart, tokens)) return slide;
    return { ...slide, chartData: { ...chart, isDummyData: true } };
  });
}
