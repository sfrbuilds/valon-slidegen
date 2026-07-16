import { describe, expect, it } from "vitest";
import {
  buildDeckRedraftPrompt,
  buildDraftPrompt,
  buildEvalPrompt,
  buildRedraftPrompt,
  FACTUAL_GROUNDING_RULES,
} from "../prompts";
import type { ChatMessage, Slide } from "../types";
import type { Template } from "../templates";

const base = {
  brief: "CEO update. 6 slides: slide 1 the quarter, slide 2 the numbers.",
  team: "executive-board" as const,
  audience: "internal" as const,
  contextDoc: null,
};

describe("buildDraftPrompt length guidance", () => {
  it("freeform (null): sizes from the brief, never forces a count", () => {
    const prompt = buildDraftPrompt({ ...base, targetLength: null });
    expect(prompt).toContain("Choose the slide count that best serves the brief.");
    expect(prompt).toContain(
      "If the brief specifies a number of slides or a slide-by-slide structure, follow it exactly."
    );
    expect(prompt).not.toContain("Produce exactly");
    expect(prompt).not.toContain("-slide presentation");
  });

  it("explicit count: produces exactly that many slides", () => {
    const prompt = buildDraftPrompt({ ...base, targetLength: 6 });
    expect(prompt).toContain("Draft a complete 6-slide presentation");
    expect(prompt).toContain("Produce exactly 6 slides.");
  });

  it("template: template structure sets the count, not the request", () => {
    const prompt = buildDraftPrompt({
      ...base,
      targetLength: null,
      templateId: "investor-update",
    });
    expect(prompt).toContain('Draft a "Investor Update" deck');
    expect(prompt).toContain("Aim for 8 slides, matching the template structure.");
    expect(prompt).not.toContain("Produce exactly");
  });
});

describe("factual grounding rules", () => {
  const slide: Slide = {
    id: "slide_1",
    layout: "content",
    heading: "The quarter",
    bullets: ["Point"],
  };
  const deck = {
    title: "Board update",
    brief: base.brief,
    team: base.team,
    audience: base.audience,
    contextDoc: null,
  };

  it("ban unsupported qualitative claims, not just invented numbers", () => {
    // The reviewer's second live failure: prose asserting company results
    // ("targets surpassed", "traction demonstrated") with no numbers to
    // trip the numeric rule. The rules must cover claims without figures.
    expect(FACTUAL_GROUNDING_RULES).toContain(
      "qualitative claims as much as to numbers"
    );
    expect(FACTUAL_GROUNDING_RULES).toContain(
      "even when no number is attached"
    );
    // Industry context is allowed only as hypothesis/consideration/question,
    // never as an unsupported company-specific statement.
    expect(FACTUAL_GROUNDING_RULES).toContain(
      "hypothesis, consideration, or question"
    );
    expect(FACTUAL_GROUNDING_RULES).not.toContain(
      "non-numeric industry context is fine"
    );
    // The closing self-check must name every source a fact can come from,
    // not just the brief: uploaded reference docs and chat count too.
    expect(FACTUAL_GROUNDING_RULES).toContain(
      "is this stated in the brief, the reference document, or the user's instructions?"
    );
  });

  it("are present in draft, slide-redraft, and deck-redraft prompts", () => {
    const draft = buildDraftPrompt({ ...base, targetLength: null });
    const redraft = buildRedraftPrompt({
      deck,
      slide,
      slideNumber: 1,
      totalSlides: 1,
      instruction: "punchier",
      neighborHeadings: [],
      chatHistory: [],
    });
    const deckRedraft = buildDeckRedraftPrompt({
      deck,
      slides: [slide],
      instruction: "punchier",
      chatHistory: [],
    });
    for (const prompt of [draft, redraft, deckRedraft]) {
      expect(prompt).toContain(FACTUAL_GROUNDING_RULES);
    }
  });
});

describe("buildEvalPrompt review scope", () => {
  const deck = {
    title: "Board update",
    brief: base.brief,
    team: base.team,
    audience: base.audience,
    contextDoc: null,
  };
  const slides: Slide[] = [
    {
      id: "slide_1",
      layout: "content",
      heading: "The quarter",
      bullets: ["Point"],
      chartData: {
        type: "bar",
        labels: ["Q1"],
        series: [{ name: "ARR ($M)", values: [25] }],
        caption: "Illustrative ARR trend.",
        isDummyData: true,
      },
    },
  ];

  it("carries the grounding rubric and the pass verdict contract", () => {
    const prompt = buildEvalPrompt({ deck, slides, chatHistory: [] });
    expect(prompt).toContain("Grounding rules for the review:");
    expect(prompt).toContain(
      "not supported by the brief, reference document, or the user's instructions"
    );
    expect(prompt).toContain('"verdict": "pass" | "needs-revision"');
    expect(prompt).not.toContain("on-brand");
  });

  it("includes the reference document text, not just its filename", () => {
    const prompt = buildEvalPrompt({
      deck: {
        ...deck,
        contextDoc: {
          filename: "q2-metrics.txt",
          text: "Quarterly ARR: 19, 21.5, 23, 25 ($M)",
          truncated: false,
          uploadedAt: "2026-07-16T00:00:00.000Z",
        },
      },
      slides,
      chatHistory: [],
    });
    expect(prompt).toContain("Quarterly ARR: 19, 21.5, 23, 25 ($M)");
  });

  it("includes user chat messages as grounding sources, never assistant ones", () => {
    const chatHistory: ChatMessage[] = [
      {
        id: "msg_1",
        role: "user",
        content: "yes, 23 is the actual Q1 number",
        timestamp: "2026-07-16T00:00:00.000Z",
        scope: "deck",
      },
      {
        id: "msg_2",
        role: "assistant",
        content: "Updated the chart to show strong momentum.",
        timestamp: "2026-07-16T00:00:01.000Z",
        scope: "deck",
      },
    ];
    const prompt = buildEvalPrompt({ deck, slides, chatHistory });
    expect(prompt).toContain("yes, 23 is the actual Q1 number");
    expect(prompt).not.toContain("Updated the chart to show strong momentum.");
  });

  it("shows chart captions to the reviewer", () => {
    const prompt = buildEvalPrompt({ deck, slides, chatHistory: [] });
    expect(prompt).toContain("chart caption: Illustrative ARR trend.");
  });
});

describe("buildDraftPrompt custom template override", () => {
  const custom: Template = {
    id: "custom_x",
    name: "Our pipeline review",
    description: "Saved from a deck.",
    defaultTeam: "gtm",
    defaultAudience: "internal",
    targetLength: 2,
    outline: [
      { layout: "title", heading: "Cover", hint: "Deck cover." },
      { layout: "content", heading: "Wins against target", hint: "4 tight bullets." },
    ],
  };

  it("uses the custom outline instead of the built-in id lookup", () => {
    const prompt = buildDraftPrompt({
      ...base,
      targetLength: null,
      templateId: "custom_x", // unresolvable server-side; override must win
      customTemplate: custom,
    });
    expect(prompt).toContain('Draft a "Our pipeline review" deck');
    expect(prompt).toContain("Wins against target");
    expect(prompt).toContain("Aim for 2 slides, matching the template structure.");
  });
});
