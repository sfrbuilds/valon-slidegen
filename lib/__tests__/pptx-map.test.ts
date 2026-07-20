import { describe, expect, it } from "vitest";
import { mapSlide, slugify } from "../pptx-map";
import type { Slide } from "../types";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Q4 Investor Update")).toBe("q4-investor-update");
  });
  it("strips unsafe filename characters", () => {
    expect(slugify("Board Update: Nov / Dec 2026!")).toBe("board-update-nov-dec-2026");
  });
  it("falls back for empty or symbol-only titles", () => {
    expect(slugify("")).toBe("valon-deck");
    expect(slugify("???")).toBe("valon-deck");
  });
});

const baseContent: Slide = {
  id: "slide_1",
  layout: "content",
  heading: "Headline results",
  bullets: ["ARR $250M", "40% YoY"],
};

describe("mapSlide (content) heading accent placement", () => {
  it("pulls the gold dash up under a single-line heading", () => {
    const short = mapSlide(baseContent);
    const long = mapSlide({
      ...baseContent,
      heading:
        "A deliberately long heading that will certainly wrap onto a second line at thirty-two points",
    });
    if (short.layout !== "content" || long.layout !== "content") return;
    // The dash tracks the estimated heading height instead of a fixed
    // worst-case box, so short headings must place it strictly higher.
    expect(short.headingAccent.y).toBeLessThan(long.headingAccent.y);
    // And it sits directly under the heading box, not floating below it.
    expect(short.headingAccent.y).toBeCloseTo(
      short.texts[0].y + short.texts[0].h + 0.05,
      2
    );
  });

  it("stacks bullets cumulatively so wrapping bullets never overlap", () => {
    const wordy = mapSlide({
      ...baseContent,
      bullets: [
        "Risk: Increased competitive pressure in key segments. Likelihood: High. Mitigation: Accelerate feature development in differentiating areas across the platform roadmap.",
        "Risk: New compliance requirements for mortgage servicing. Likelihood: Medium. Mitigation: Engage legal counsel and update platform architecture.",
        "Short bullet.",
      ],
    });
    if (wordy.layout !== "content") return;
    const bullets = wordy.texts.filter((t) => "bullet" in t && t.bullet);
    expect(bullets).toHaveLength(3);
    // Each bullet's box must end before the next one starts: a wrapping
    // bullet pushes its successors down instead of printing over them.
    for (let i = 1; i < bullets.length; i++) {
      expect(bullets[i].y).toBeGreaterThanOrEqual(
        bullets[i - 1].y + bullets[i - 1].h
      );
    }
    // And the multi-line first bullet must get a taller box than the
    // single-line third one.
    expect(bullets[0].h).toBeGreaterThan(bullets[2].h);
  });

  it("keeps the body below the dash for both heading lengths", () => {
    const short = mapSlide(baseContent);
    if (short.layout !== "content") return;
    const firstBullet = short.texts.find((t) => "bullet" in t && t.bullet);
    expect(firstBullet).toBeDefined();
    expect(firstBullet!.y).toBeGreaterThan(short.headingAccent.y);
  });
});

describe("mapSlide (content)", () => {
  it("uses full width without a side visual", () => {
    const spec = mapSlide(baseContent);
    expect(spec.layout).toBe("content");
    if (spec.layout !== "content") return;
    expect(spec.texts[0].w).toBeCloseTo(11.83);
    expect(spec.chart).toBeNull();
    expect(spec.image).toBeNull();
  });

  it("narrows text and places the chart when chartData is present", () => {
    const spec = mapSlide({
      ...baseContent,
      chartData: {
        type: "bar",
        labels: ["Q1", "Q2"],
        series: [{ name: "ARR ($M)", values: [180, 250] }],
        isDummyData: true,
        caption: "Illustrative quarterly ARR",
        yAxisLabel: "$M",
      },
    });
    if (spec.layout !== "content") throw new Error("wrong layout");
    expect(spec.texts[0].w).toBeCloseTo(6.7);
    expect(spec.chart).not.toBeNull();
    expect(spec.chart!.dummyChip).not.toBeNull();
    expect(spec.chart!.caption).not.toBeNull();
    expect(spec.chart!.caption!.text).toBe("Illustrative quarterly ARR");
  });

  it("omits the dummy chip for grounded numbers", () => {
    const spec = mapSlide({
      ...baseContent,
      chartData: {
        type: "line",
        labels: ["Q1", "Q2"],
        series: [{ name: "ARR ($M)", values: [180, 250] }],
        isDummyData: false,
      },
    });
    if (spec.layout !== "content") throw new Error("wrong layout");
    expect(spec.chart!.dummyChip).toBeNull();
  });

  it("gives a bullet-less chart the full slide width", () => {
    const spec = mapSlide({
      ...baseContent,
      bullets: [],
      chartData: {
        type: "line",
        labels: ["Q1", "Q2"],
        series: [{ name: "ARR ($M)", values: [24.1, 27.8] }],
        isDummyData: false,
      },
    });
    if (spec.layout !== "content") throw new Error("wrong layout");
    expect(spec.chart!.x).toBeCloseTo(0.75);
    expect(spec.chart!.w).toBeCloseTo(11.83);
    // With bullets present the chart stays in the right column.
    const withBullets = mapSlide({
      ...baseContent,
      chartData: {
        type: "line",
        labels: ["Q1", "Q2"],
        series: [{ name: "ARR ($M)", values: [24.1, 27.8] }],
        isDummyData: false,
      },
    });
    if (withBullets.layout !== "content") throw new Error("wrong layout");
    expect(withBullets.chart!.x).toBeCloseTo(7.7);
    expect(withBullets.chart!.w).toBeCloseTo(4.9);
  });

  it("chart takes the visual slot over a stale image", () => {
    const spec = mapSlide({
      ...baseContent,
      imageData: "data:image/png;base64,xxx",
      chartData: {
        type: "bar",
        labels: ["a"],
        series: [{ name: "s", values: [1] }],
        isDummyData: true,
      },
    });
    if (spec.layout !== "content") throw new Error("wrong layout");
    expect(spec.chart).not.toBeNull();
    expect(spec.image).toBeNull();
  });
});

describe("mapSlide (title / section)", () => {
  it("renders title slide on paper white with optional subheading", () => {
    const spec = mapSlide({
      id: "s",
      layout: "title",
      heading: "Q4 Update",
      subheading: "November 2026",
      bullets: [],
    });
    expect(spec.layout).toBe("title");
    if (spec.layout !== "title") return;
    expect(spec.texts).toHaveLength(2);
  });

  it("renders section slide on ink background", () => {
    const spec = mapSlide({
      id: "s",
      layout: "section",
      heading: "What's next",
      bullets: [],
    });
    expect(spec.layout).toBe("section");
    if (spec.layout !== "section") return;
    expect(spec.background.toLowerCase()).toBe("#141210");
  });
});
