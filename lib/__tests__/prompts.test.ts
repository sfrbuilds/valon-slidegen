import { describe, expect, it } from "vitest";
import { buildDraftPrompt } from "../prompts";
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
