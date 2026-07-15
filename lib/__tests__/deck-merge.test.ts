import { describe, expect, it } from "vitest";
import { mergeDeckSlides } from "../deck-merge";
import type { DraftedSlide } from "../deck-schema";
import type { Slide } from "../types";

const noRemoval = { chartRemoval: false, imageRemoval: false };

function slide(id: string, heading: string, extra: Partial<Slide> = {}): Slide {
  return { id, layout: "content", heading, bullets: [], ...extra };
}

function drafted(
  heading: string,
  sourceSlideId?: string,
  extra: Partial<DraftedSlide> = {}
): DraftedSlide {
  return { layout: "content", heading, bullets: [], sourceSlideId, ...extra };
}

describe("mergeDeckSlides (identity by sourceSlideId)", () => {
  const prior: Slide[] = [
    slide("s1", "Intro"),
    slide("s2", "Metrics", {
      imageIdea: "sunrise",
      imageData: "data:image/png;base64,IMG2",
    }),
    slide("s3", "Asks"),
  ];

  it("keeps ids and images attached when a middle slide is removed", () => {
    // Model dropped "Intro"; positional merge would glue s1's identity
    // onto Metrics and hand Metrics' image to the wrong slide.
    const out = mergeDeckSlides(
      prior,
      [drafted("Metrics v2", "s2"), drafted("Asks v2", "s3")],
      noRemoval
    );
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("s2");
    expect(out[0].imageData).toBe("data:image/png;base64,IMG2");
    expect(out[1].id).toBe("s3");
  });

  it("keeps ids stable when a slide is inserted in the middle", () => {
    const out = mergeDeckSlides(
      prior,
      [
        drafted("Intro", "s1"),
        drafted("Brand new", undefined),
        drafted("Metrics", "s2"),
        drafted("Asks", "s3"),
      ],
      noRemoval
    );
    expect(out).toHaveLength(4);
    expect(out[0].id).toBe("s1");
    expect(out[1].id).not.toMatch(/^s[123]$/); // fresh id
    expect(out[2].id).toBe("s2");
    expect(out[2].imageData).toBe("data:image/png;base64,IMG2");
    expect(out[3].id).toBe("s3");
  });

  it("follows ids across reordering", () => {
    const out = mergeDeckSlides(
      prior,
      [drafted("Asks", "s3"), drafted("Intro", "s1"), drafted("Metrics", "s2")],
      noRemoval
    );
    expect(out.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
  });

  it("treats an invented sourceSlideId as a new slide", () => {
    const out = mergeDeckSlides(prior, [drafted("Fake", "s99"), drafted("Intro", "s1")], noRemoval);
    expect(out[0].id).not.toBe("s99");
    expect(out[1].id).toBe("s1");
  });

  it("binds a duplicated sourceSlideId only once", () => {
    const out = mergeDeckSlides(
      prior,
      [drafted("A", "s1"), drafted("B", "s1")],
      noRemoval
    );
    expect(out[0].id).toBe("s1");
    expect(out[1].id).not.toBe("s1");
  });

  it("falls back to positional merge when no ids were echoed", () => {
    const out = mergeDeckSlides(
      prior,
      [drafted("Intro v2"), drafted("Metrics v2"), drafted("Asks v2")],
      noRemoval
    );
    expect(out.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("mergeDeckSlides (visual semantics)", () => {
  const prior: Slide[] = [
    slide("s1", "Visual", {
      imageIdea: "sunrise",
      imageData: "data:image/png;base64,IMG",
    }),
  ];

  it("keeps the generated image when the idea is unchanged", () => {
    const out = mergeDeckSlides(
      prior,
      [drafted("Visual", "s1", { imageIdea: "sunrise" })],
      noRemoval
    );
    expect(out[0].imageData).toBe("data:image/png;base64,IMG");
  });

  it("drops the stale render when the idea changes", () => {
    const out = mergeDeckSlides(
      prior,
      [drafted("Visual", "s1", { imageIdea: "sunset" })],
      noRemoval
    );
    expect(out[0].imageIdea).toBe("sunset");
    expect(out[0].imageData).toBeUndefined();
  });

  it("a new chart takes the visual slot and clears the image render", () => {
    const out = mergeDeckSlides(
      prior,
      [
        drafted("Visual", "s1", {
          chartData: {
            type: "bar",
            labels: ["a"],
            series: [{ name: "s", values: [1] }],
            isDummyData: true,
          },
        }),
      ],
      noRemoval
    );
    expect(out[0].chartData).toBeDefined();
    expect(out[0].imageData).toBeUndefined();
  });

  it("honors image removal intent instead of restoring the prior image", () => {
    const out = mergeDeckSlides(
      prior,
      [drafted("Visual", "s1")],
      { chartRemoval: false, imageRemoval: true }
    );
    expect(out[0].imageIdea).toBeUndefined();
    expect(out[0].imageData).toBeUndefined();
  });

  it("preserves an omitted chart by default (models are lazy) but honors removal intent", () => {
    const withChart: Slide[] = [
      slide("c1", "Chart", {
        chartData: {
          type: "bar",
          labels: ["a"],
          series: [{ name: "s", values: [1] }],
          isDummyData: true,
        },
      }),
    ];
    const kept = mergeDeckSlides(withChart, [drafted("Chart", "c1")], noRemoval);
    expect(kept[0].chartData).toBeDefined();
    const removed = mergeDeckSlides(withChart, [drafted("Chart", "c1")], {
      chartRemoval: true,
      imageRemoval: false,
    });
    expect(removed[0].chartData).toBeUndefined();
  });
});
