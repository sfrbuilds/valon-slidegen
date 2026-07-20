import { describe, expect, it } from "vitest";
import { deriveTemplateFromDeck, TEMPLATE_LIMITS } from "../deck-templates";
import type { Deck, Slide } from "../types";

// Distinctive values: assertions check these exact numbers never appear
// in the derived template, without banning numerals generally (headings
// like "Q3 2026 Pipeline Review" legitimately contain digits).
const DISTINCTIVE_VALUES = [73519, 84211, 90007];

function makeSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "s1",
    layout: "content",
    heading: "Pipeline snapshot",
    bullets: [],
    ...overrides,
  };
}

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: "deck_1",
    title: "Q3 2026 Pipeline Review",
    team: "gtm",
    audience: "internal",
    brief: "Quarterly pipeline review",
    targetLength: 3,
    contextDocs: [],
    templateId: null,
    slides: [
      makeSlide({ id: "s1", layout: "title", heading: "Q3 2026 Pipeline Review", subheading: "GTM quarterly" }),
      makeSlide({
        id: "s2",
        heading: "Wins against target",
        bullets: ["Closed $1.2M", "Two new logos", "Churn flat", "Expansion up"],
        chartData: {
          type: "bar",
          labels: ["Jul", "Aug", "Sep"],
          series: [
            { name: "Pipeline", values: [DISTINCTIVE_VALUES[0], DISTINCTIVE_VALUES[1], DISTINCTIVE_VALUES[2]] },
            { name: "Closed", values: [100, 200, 300] },
          ],
          isDummyData: false,
        },
      }),
      makeSlide({
        id: "s3",
        heading: "Team on the ground",
        bullets: ["One bullet"],
        imageIdea: "Warm illustration of a sales team",
        imageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg",
      }),
      makeSlide({ id: "s4", layout: "section", heading: "What's next", subheading: "The forward half" }),
      makeSlide({ id: "s5", heading: "Empty structural slide" }),
    ],
    chatHistory: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveTemplateFromDeck", () => {
  it("maps deck fields onto the template", () => {
    const tpl = deriveTemplateFromDeck(makeDeck(), "Our pipeline review");
    expect(tpl.id.startsWith("custom_")).toBe(true);
    expect(tpl.name).toBe("Our pipeline review");
    expect(tpl.description).toBe('Saved from "Q3 2026 Pipeline Review".');
    expect(tpl.defaultTeam).toBe("gtm");
    expect(tpl.defaultAudience).toBe("internal");
    expect(tpl.targetLength).toBe(5);
    expect(tpl.outline).toHaveLength(5);
  });

  it("copies layout and heading verbatim per slide", () => {
    const tpl = deriveTemplateFromDeck(makeDeck(), "T");
    expect(tpl.outline[0]).toMatchObject({ layout: "title", heading: "Q3 2026 Pipeline Review" });
    expect(tpl.outline[1]).toMatchObject({ layout: "content", heading: "Wins against target" });
    expect(tpl.outline[3]).toMatchObject({ layout: "section", heading: "What's next" });
  });

  it("derives hints from content shape: bullets, chart, image, dividers", () => {
    const tpl = deriveTemplateFromDeck(makeDeck(), "T");
    expect(tpl.outline[0].hint).toContain("Deck cover.");
    expect(tpl.outline[0].hint).toContain("Include a short subtitle.");
    expect(tpl.outline[1].hint).toContain("4 tight bullets.");
    expect(tpl.outline[1].hint).toContain("Include chartData (bar, 2 series).");
    expect(tpl.outline[1].hint).toContain("Set isDummyData true unless the brief provides real numbers.");
    expect(tpl.outline[2].hint).toContain("1 tight bullet.");
    expect(tpl.outline[2].hint).toContain("Supporting editorial illustration.");
    expect(tpl.outline[3].hint).toContain("Divider slide.");
    expect(tpl.outline[3].hint).toContain("Include one line of context.");
    expect(tpl.outline[4].hint).toBe("Short, focused slide.");
  });

  it("single-series chart hint omits the series count", () => {
    const deck = makeDeck({
      slides: [
        makeSlide({
          chartData: {
            type: "line",
            labels: ["Q1"],
            series: [{ name: "ARR", values: [42] }],
            isDummyData: true,
          },
        }),
      ],
    });
    const tpl = deriveTemplateFromDeck(deck, "T");
    expect(tpl.outline[0].hint).toContain("Include chartData (line).");
  });

  it("reads only presence and shape: no image payloads, no chart values", () => {
    const json = JSON.stringify(deriveTemplateFromDeck(makeDeck(), "T"));
    expect(json).not.toContain("data:");
    expect(json).not.toContain("imageData");
    for (const v of DISTINCTIVE_VALUES) {
      expect(json).not.toContain(String(v));
    }
    // Tiny text blob by construction, nowhere near the storage quota.
    expect(json.length).toBeLessThan(4096);
  });

  it("trims and caps the name and headings", () => {
    const longName = `  ${"n".repeat(TEMPLATE_LIMITS.name + 50)}  `;
    const deck = makeDeck({
      slides: [makeSlide({ heading: "h".repeat(TEMPLATE_LIMITS.heading + 50) })],
    });
    const tpl = deriveTemplateFromDeck(deck, longName);
    expect(tpl.name).toHaveLength(TEMPLATE_LIMITS.name);
    expect(tpl.outline[0].heading).toHaveLength(TEMPLATE_LIMITS.heading);
  });
});
