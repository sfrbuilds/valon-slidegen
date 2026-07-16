import { describe, expect, it } from "vitest";
import {
  chartIsGrounded,
  enforceChartGrounding,
  extractNumericTokens,
  trustedChartNumbers,
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

  it("keeps a chart marked real when every value appears in the source", () => {
    // KNOWN LIMITATION, documented on purpose: 25, 40, and 22 do appear
    // in the brief, but as ARR ($M), growth (%), and runway (months).
    // The guard checks value-level provenance only - it cannot tell that
    // an "ARR" series borrowing all three is semantically wrong. Cross-
    // metric collisions like this pass; the prompt rules are the only
    // defense at that layer. If this behavior changes, this test should
    // change with it.
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

describe("trustedChartNumbers / user-confirmed priors", () => {
  it("collects values only from charts the user accepted as real", () => {
    const slides = [
      { chartData: chart([16, 18], false) }, // user-confirmed
      { chartData: chart([99, 98], true) }, // still illustrative
      { chartData: undefined },
    ];
    expect(trustedChartNumbers(slides)).toEqual([16, 18]);
  });

  it("a revision echoing a user-confirmed chart keeps its tag off", () => {
    // The user unticked "Mark as illustrative" (prior isDummyData: false)
    // on values that never appeared in chat. A later revision echoing the
    // chart must not force the tag back on over the user's decision.
    const prior = [{ chartData: chart([17.9, 19.5, 23], false) }];
    const next = [{ chartData: chart([17.9, 19.5, 23], false) }];
    const result = enforceChartGrounding(
      next,
      "make the heading punchier", // no numbers in the instruction
      trustedChartNumbers(prior)
    );
    expect(result[0].chartData?.isDummyData).toBe(false);
  });

  it("new invented values are still forced illustrative despite trusted priors", () => {
    const prior = [{ chartData: chart([17.9, 19.5], false) }];
    const next = [{ chartData: chart([17.9, 19.5, 42], false) }]; // 42 is new
    const result = enforceChartGrounding(
      next,
      "extend the chart one more quarter",
      trustedChartNumbers(prior)
    );
    expect(result[0].chartData?.isDummyData).toBe(true);
  });

  it("a user confirming a value in chat grounds it (the forgiving flow)", () => {
    const next = [{ chartData: chart([23], false) }];
    const result = enforceChartGrounding(next, "no, 23 mn is the true number");
    expect(result[0].chartData?.isDummyData).toBe(false);
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
