import { describe, expect, it } from "vitest";
import {
  parseDeckDraft,
  parseDeckRedraft,
  parseEvalResult,
  parseSlideRedraft,
  stripCodeFences,
} from "../deck-schema";

const validDraft = {
  deckTitle: "Q4 Investor Update",
  slides: [
    { layout: "title", heading: "Q4 Investor Update", subheading: "November 2026" },
    {
      layout: "content",
      heading: "Headline results",
      bullets: ["ARR $250M", "40% YoY"],
      chartData: {
        type: "bar",
        labels: ["Q1", "Q2"],
        series: [{ name: "ARR ($M)", values: [180, 250] }],
        isDummyData: false,
      },
    },
    { layout: "section", heading: "What's next" },
  ],
};

describe("stripCodeFences", () => {
  it("passes raw JSON through", () => {
    expect(stripCodeFences('{"a": 1}')).toBe('{"a": 1}');
  });
  it("strips markdown fences", () => {
    expect(stripCodeFences('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });
  it("extracts JSON from surrounding prose", () => {
    expect(stripCodeFences('Here is the JSON: {"a": 1}')).toBe('{"a": 1}');
  });
});

describe("parseDeckDraft", () => {
  it("parses a valid draft", () => {
    const result = parseDeckDraft(JSON.stringify(validDraft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deckTitle).toBe("Q4 Investor Update");
    expect(result.value.slides).toHaveLength(3);
    expect(result.value.slides[1].chartData?.type).toBe("bar");
    expect(result.value.slides[1].chartData?.isDummyData).toBe(false);
  });

  it("rejects invalid layout", () => {
    const bad = { ...validDraft, slides: [{ layout: "hero", heading: "x" }] };
    const result = parseDeckDraft(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it("rejects empty slides", () => {
    const result = parseDeckDraft(JSON.stringify({ deckTitle: "x", slides: [] }));
    expect(result.ok).toBe(false);
  });

  it("rejects non-JSON", () => {
    expect(parseDeckDraft("not json at all").ok).toBe(false);
  });

  it("defaults isDummyData to true when the model omits it (conservative)", () => {
    const draft = {
      deckTitle: "x",
      slides: [
        {
          layout: "content",
          heading: "h",
          bullets: [],
          chartData: {
            type: "line",
            labels: ["a", "b"],
            series: [{ name: "s", values: [1, 2] }],
          },
        },
      ],
    };
    const result = parseDeckDraft(JSON.stringify(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0].chartData?.isDummyData).toBe(true);
  });

  it("drops the WHOLE chart when a series length mismatches the labels", () => {
    const draft = {
      deckTitle: "x",
      slides: [
        {
          layout: "content",
          heading: "h",
          bullets: ["b"],
          chartData: {
            type: "bar",
            labels: ["Q1", "Q2", "Q3"],
            series: [{ name: "s", values: [1, 2] }], // 2 values, 3 labels
            isDummyData: true,
          },
        },
      ],
    };
    const result = parseDeckDraft(JSON.stringify(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0].chartData).toBeUndefined();
  });

  it("drops the chart when any value is non-numeric (no silent index shifting)", () => {
    const draft = {
      deckTitle: "x",
      slides: [
        {
          layout: "content",
          heading: "h",
          bullets: ["b"],
          chartData: {
            type: "bar",
            labels: ["Q1", "Q2"],
            series: [{ name: "s", values: [1, "n/a"] }],
            isDummyData: true,
          },
        },
      ],
    };
    const result = parseDeckDraft(JSON.stringify(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0].chartData).toBeUndefined();
  });

  it("coerces numeric strings but keeps lengths strict", () => {
    const draft = {
      deckTitle: "x",
      slides: [
        {
          layout: "content",
          heading: "h",
          bullets: ["b"],
          chartData: {
            type: "line",
            labels: ["Q1", "Q2"],
            series: [{ name: "s", values: ["40", "55"] }],
            isDummyData: true,
          },
        },
      ],
    };
    const result = parseDeckDraft(JSON.stringify(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0].chartData?.series[0].values).toEqual([40, 55]);
  });

  it("drops the chart when a label is not a string", () => {
    const draft = {
      deckTitle: "x",
      slides: [
        {
          layout: "content",
          heading: "h",
          bullets: ["b"],
          chartData: {
            type: "bar",
            labels: ["Q1", 2],
            series: [{ name: "s", values: [1, 2] }],
            isDummyData: true,
          },
        },
      ],
    };
    const result = parseDeckDraft(JSON.stringify(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0].chartData).toBeUndefined();
  });

  it("drops malformed chartData instead of failing the deck", () => {
    const draft = {
      deckTitle: "x",
      slides: [
        {
          layout: "content",
          heading: "h",
          bullets: ["b"],
          chartData: { type: "pie", labels: [], series: [] },
        },
      ],
    };
    const result = parseDeckDraft(JSON.stringify(draft));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0].chartData).toBeUndefined();
  });
});

describe("parseSlideRedraft", () => {
  it("parses a valid redraft", () => {
    const raw = JSON.stringify({
      slide: { layout: "content", heading: "h", bullets: ["a"] },
      editSummary: "Tightened the heading.",
    });
    const result = parseSlideRedraft(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.editSummary).toBe("Tightened the heading.");
  });

  it("treats null chartData as absent (removal handled at route level)", () => {
    const raw = JSON.stringify({
      slide: { layout: "content", heading: "h", bullets: [], chartData: null },
      editSummary: "Removed the chart.",
    });
    const result = parseSlideRedraft(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slide.chartData).toBeUndefined();
  });
});

describe("parseDeckRedraft", () => {
  it("parses a full-deck revision", () => {
    const raw = JSON.stringify({
      slides: validDraft.slides,
      editSummary: "Shortened every heading.",
    });
    const result = parseDeckRedraft(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides).toHaveLength(3);
    expect(result.value.editSummary).toBe("Shortened every heading.");
  });

  it("captures sourceSlideId, treating null/empty as absent", () => {
    const raw = JSON.stringify({
      slides: [
        { sourceSlideId: "slide_abc", layout: "content", heading: "h", bullets: [] },
        { sourceSlideId: null, layout: "content", heading: "new", bullets: [] },
        { sourceSlideId: "  ", layout: "content", heading: "blank", bullets: [] },
      ],
      editSummary: "x",
    });
    const result = parseDeckRedraft(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0].sourceSlideId).toBe("slide_abc");
    expect(result.value.slides[1].sourceSlideId).toBeUndefined();
    expect(result.value.slides[2].sourceSlideId).toBeUndefined();
  });

  it("rejects a response without slides", () => {
    expect(parseDeckRedraft(JSON.stringify({ editSummary: "x" })).ok).toBe(false);
  });
});

describe("parseEvalResult", () => {
  it("parses an on-brand verdict", () => {
    const result = parseEvalResult(
      JSON.stringify({ verdict: "on-brand", findings: [] })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe("on-brand");
    expect(result.value.findings).toHaveLength(0);
  });

  it("parses findings with and without slide numbers", () => {
    const result = parseEvalResult(
      JSON.stringify({
        verdict: "needs-revision",
        findings: [
          { slide: 2, issue: '"game-changing" violates the avoid list' },
          { issue: "Deck-level: headings read as marketing copy" },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings[0].slideNumber).toBe(2);
    expect(result.value.findings[1].slideNumber).toBeNull();
  });

  it("caps findings at 6", () => {
    const findings = Array.from({ length: 10 }, (_, i) => ({
      slide: i + 1,
      issue: `issue ${i}`,
    }));
    const result = parseEvalResult(
      JSON.stringify({ verdict: "needs-revision", findings })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings).toHaveLength(6);
  });

  it("rejects an unknown verdict", () => {
    expect(
      parseEvalResult(JSON.stringify({ verdict: "meh", findings: [] })).ok
    ).toBe(false);
  });
});
