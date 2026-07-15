import { describe, expect, it } from "vitest";
import {
  parseCustomTemplate,
  parseDeckDraft,
  parseDeckRedraft,
  parseEvalResult,
  parseSlideRedraft,
  stripCodeFences,
} from "../deck-schema";
import { TEMPLATE_LIMITS } from "../templates";

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

describe("parseCustomTemplate", () => {
  const validTemplate = {
    id: "custom_abc",
    name: "Our pipeline review",
    description: 'Saved from "Q3".',
    defaultTeam: "gtm",
    defaultAudience: "internal",
    targetLength: 2,
    outline: [
      { layout: "title", heading: "Cover", hint: "Deck cover." },
      { layout: "content", heading: "Wins", hint: "3 tight bullets." },
    ],
  };

  it("accepts a valid template and preserves the outline", () => {
    const result = parseCustomTemplate(validTemplate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Our pipeline review");
    expect(result.value.defaultTeam).toBe("gtm");
    expect(result.value.outline).toHaveLength(2);
    expect(result.value.outline[1]).toEqual({
      layout: "content",
      heading: "Wins",
      hint: "3 tight bullets.",
    });
    expect(result.value.targetLength).toBe(2);
  });

  it("rejects non-objects and missing names", () => {
    expect(parseCustomTemplate(null).ok).toBe(false);
    expect(parseCustomTemplate("investor-update").ok).toBe(false);
    expect(parseCustomTemplate({ ...validTemplate, name: "  " }).ok).toBe(false);
    expect(parseCustomTemplate({ ...validTemplate, name: 42 }).ok).toBe(false);
  });

  it("rejects a missing or empty outline", () => {
    expect(parseCustomTemplate({ ...validTemplate, outline: undefined }).ok).toBe(false);
    expect(parseCustomTemplate({ ...validTemplate, outline: [] }).ok).toBe(false);
  });

  it("rejects an outline over the cap", () => {
    const outline = Array.from({ length: TEMPLATE_LIMITS.outlineMax + 1 }, () => ({
      layout: "content",
      heading: "H",
      hint: "",
    }));
    const result = parseCustomTemplate({ ...validTemplate, outline });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown layouts and missing headings", () => {
    expect(
      parseCustomTemplate({
        ...validTemplate,
        outline: [{ layout: "hero", heading: "H", hint: "" }],
      }).ok
    ).toBe(false);
    expect(
      parseCustomTemplate({
        ...validTemplate,
        outline: [{ layout: "content", heading: "", hint: "" }],
      }).ok
    ).toBe(false);
  });

  it("truncates overlong text instead of rejecting", () => {
    const result = parseCustomTemplate({
      ...validTemplate,
      name: "n".repeat(TEMPLATE_LIMITS.name + 100),
      outline: [
        {
          layout: "content",
          heading: "h".repeat(TEMPLATE_LIMITS.heading + 100),
          hint: "x".repeat(TEMPLATE_LIMITS.hint + 100),
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toHaveLength(TEMPLATE_LIMITS.name);
    expect(result.value.outline[0].heading).toHaveLength(TEMPLATE_LIMITS.heading);
    expect(result.value.outline[0].hint).toHaveLength(TEMPLATE_LIMITS.hint);
  });

  it("degrades invalid team/audience to defaults (draft prompt never reads them)", () => {
    const result = parseCustomTemplate({
      ...validTemplate,
      defaultTeam: "marketing",
      defaultAudience: "everyone",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.defaultTeam).toBe("new-ventures");
    expect(result.value.defaultAudience).toBe("internal");
  });

  it("derives targetLength from the outline, ignoring the claimed value", () => {
    const result = parseCustomTemplate({ ...validTemplate, targetLength: 999 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targetLength).toBe(2);
  });
});
