import { describe, expect, it } from "vitest";
import {
  chartIsGrounded,
  enforceChartGrounding,
  extractNumericTokens,
} from "../chart-grounding";
import type { ChartData } from "../types";

function chart(values: number[], isDummyData: boolean, extra: Partial<ChartData> = {}): ChartData {
  return {
    type: "bar",
    labels: values.map((_, i) => `Q${i + 1}`),
    series: [{ name: "ARR ($M)", values }],
    isDummyData,
    ...extra,
  };
}

describe("extractNumericTokens", () => {
  it("extracts plain numbers, decimals, percentages, and dollar amounts", () => {
    const tokens = extractNumericTokens(
      "ARR reached $25M, up 40% year over year. Runway is 22 months. NPS 71.5."
    );
    expect(tokens.has(25)).toBe(true);
    expect(tokens.has(40)).toBe(true);
    expect(tokens.has(22)).toBe(true);
    expect(tokens.has(71.5)).toBe(true);
  });

  it("normalizes thousands separators", () => {
    const tokens = extractNumericTokens("We processed 1,200 loans and 12,500,000 payments.");
    expect(tokens.has(1200)).toBe(true);
    expect(tokens.has(12500000)).toBe(true);
  });

  it("handles negatives and empty text", () => {
    expect(extractNumericTokens("burn improved by -3.2").has(-3.2)).toBe(true);
    expect(extractNumericTokens("no numbers here").size).toBe(0);
  });
});

describe("enforceChartGrounding", () => {
  // The reviewer's live failure, pinned: brief provides only the 25;
  // the model charted [19, 21, 23, 25] and claimed isDummyData: false.
  const REVIEWER_BRIEF =
    "Create a five-slide board update on Q2 performance. ARR reached $25M, up 40% year over year. Runway is 22 months. Include a chart showing quarterly ARR and end with the decision whether to approve the Phoenix expansion.";

  it("overrides an ungrounded 'real' claim to illustrative (reviewer regression)", () => {
    const slides = [{ chartData: chart([19, 21, 23, 25], false) }];
    const result = enforceChartGrounding(slides, REVIEWER_BRIEF);
    expect(result[0].chartData?.isDummyData).toBe(true);
  });

  it("keeps a fully grounded chart marked real", () => {
    // 25, 40, 22 and 5 all appear in the brief text.
    const slides = [{ chartData: chart([25, 40, 22], false) }];
    const result = enforceChartGrounding(slides, REVIEWER_BRIEF);
    expect(result[0].chartData?.isDummyData).toBe(false);
  });

  it("one ungrounded value in a multi-series chart forces illustrative", () => {
    const c = chart([25], false, {
      series: [
        { name: "Target ($M)", values: [25] },
        { name: "Actual ($M)", values: [26.1] },
      ],
    });
    const result = enforceChartGrounding([{ chartData: c }], REVIEWER_BRIEF);
    expect(result[0].chartData?.isDummyData).toBe(true);
  });

  it("leaves charts already marked illustrative untouched", () => {
    const c = chart([1, 2, 3], true);
    const result = enforceChartGrounding([{ chartData: c }], REVIEWER_BRIEF);
    expect(result[0].chartData).toBe(c); // same object, no rewrite
  });

  it("passes slides without charts through unchanged", () => {
    const slide = { chartData: undefined };
    expect(enforceChartGrounding([slide], REVIEWER_BRIEF)[0]).toBe(slide);
  });

  it("grounds against reference-document text, not just the brief", () => {
    const slides = [{ chartData: chart([19, 21.5, 23, 25], false) }];
    const source = `${REVIEWER_BRIEF}\nQuarterly ARR: 19, 21.5, 23, 25 ($M)`;
    const result = enforceChartGrounding(slides, source);
    expect(result[0].chartData?.isDummyData).toBe(false);
  });

  it("does not mutate the input slides", () => {
    const c = chart([99], false);
    const slides = [{ chartData: c }];
    enforceChartGrounding(slides, REVIEWER_BRIEF);
    expect(c.isDummyData).toBe(false); // original untouched
  });
});

describe("chartIsGrounded", () => {
  it("is exact-match on values, not substring", () => {
    // Brief contains 25; chart value 2.5 must NOT be grounded by it.
    const tokens = extractNumericTokens("ARR $25M");
    expect(chartIsGrounded(chart([2.5], false), tokens)).toBe(false);
    expect(chartIsGrounded(chart([25], false), tokens)).toBe(true);
  });
});
