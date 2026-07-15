/**
 * Deck to PPTX mapping. Pure function: takes a Deck, returns a spec that
 * pptx-map's caller feeds to pptxgenjs. Text and images are placed as
 * separate layers (never text baked into images).
 */

import type { Deck, Slide } from "./types";
import { BRAND } from "./brand";

// Widescreen slide dimensions in inches (pptxgenjs LAYOUT_WIDE)
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

// Layout: title
function renderTitleSlide(slide: Slide) {
  return {
    layout: "title" as const,
    background: BRAND.colors.paperWhite,
    texts: [
      {
        text: slide.heading,
        x: 0.75,
        y: 2.8,
        w: 11.83,
        h: 1.5,
        fontFace: BRAND.pptxFonts.sans,
        fontSize: 50,
        italic: false,
        color: BRAND.colors.ink900.replace("#", ""),
        bold: true,
        align: "left" as const,
      },
      ...(slide.subheading
        ? [
            {
              text: slide.subheading,
              x: 0.75,
              y: 4.4,
              w: 11.83,
              h: 0.8,
              fontFace: BRAND.pptxFonts.sans,
              fontSize: 22,
              color: BRAND.colors.ink500.replace("#", ""),
              italic: false,
              bold: false,
              align: "left" as const,
            },
          ]
        : []),
    ],
    accentBar: {
      x: 0.75,
      y: 5.4,
      w: 0.6,
      h: 0.06,
      fill: BRAND.colors.accent.replace("#", ""),
    },
  };
}

// Layout: section
function renderSectionSlide(slide: Slide) {
  return {
    layout: "section" as const,
    background: BRAND.colors.ink900,
    texts: [
      {
        text: slide.heading,
        x: 0.75,
        y: 3.0,
        w: 11.83,
        h: 1.5,
        fontFace: BRAND.pptxFonts.sans,
        fontSize: 40,
        italic: false,
        color: BRAND.colors.paperWhite.replace("#", ""),
        bold: true,
        align: "left" as const,
      },
    ],
    accentBar: {
      x: 0.75,
      y: 4.5,
      w: 0.6,
      h: 0.06,
      fill: BRAND.colors.accent.replace("#", ""),
    },
  };
}

// Layout: content
function renderContentSlide(slide: Slide) {
  const hasChart = Boolean(slide.chartData);
  const hasImage = Boolean(slide.imageData) && !hasChart;
  const hasSideVisual = hasChart || hasImage;
  const contentWidth = hasSideVisual ? 6.7 : 11.83;
  // Heading gets a generous box so 2-line titles don't overflow onto the dash.
  const HEADING_Y = 0.55;
  const HEADING_H = 1.6;
  const HEADING_ACCENT_Y = HEADING_Y + HEADING_H + 0.05; // 2.20
  const HEADING_ACCENT_H = 0.05;
  const bodyTop = slide.subheading
    ? HEADING_ACCENT_Y + 0.55
    : HEADING_ACCENT_Y + 0.35;
  // Sized for a room, not a laptop: 18pt body needs a taller row.
  const bulletStep = 0.72;
  const bulletRowHeight = 0.62;
  return {
    layout: "content" as const,
    background: BRAND.colors.paperWhite,
    texts: [
      {
        text: slide.heading,
        x: 0.75,
        y: HEADING_Y,
        w: contentWidth,
        h: HEADING_H,
        fontFace: BRAND.pptxFonts.sans,
        fontSize: 32,
        color: BRAND.colors.ink900.replace("#", ""),
        italic: false,
        bold: true,
        align: "left" as const,
      },
      ...(slide.subheading
        ? [
            {
              text: slide.subheading,
              x: 0.75,
              y: HEADING_ACCENT_Y + 0.15,
              w: contentWidth,
              h: 0.4,
              fontFace: BRAND.pptxFonts.sans,
              fontSize: 15,
              color: BRAND.colors.ink500.replace("#", ""),
              italic: false,
              bold: false,
              align: "left" as const,
            },
          ]
        : []),
      ...slide.bullets.map((bullet, index) => ({
        text: bullet,
        x: 0.75,
        y: bodyTop + index * bulletStep,
        w: contentWidth,
        h: bulletRowHeight,
        fontFace: BRAND.pptxFonts.sans,
        fontSize: 18,
        color: BRAND.colors.ink700.replace("#", ""),
        bullet: true,
        italic: false,
        bold: false,
        align: "left" as const,
      })),
    ],
    image: hasImage
      ? {
          data: slide.imageData!,
          x: 7.7,
          y: HEADING_ACCENT_Y + 0.05,
          w: 4.9,
          h: 4.3,
        }
      : null,
    chart: hasChart
      ? {
          data: slide.chartData!,
          x: 7.7,
          y: HEADING_ACCENT_Y + 0.05,
          w: 4.9,
          h: 4.3,
          dummyChip: slide.chartData!.isDummyData
            ? {
                text: "Illustrative data",
                x: 7.7,
                y: HEADING_ACCENT_Y + 4.4,
                w: 1.5,
                h: 0.3,
                fill: BRAND.colors.accentSoft.replace("#", ""),
                color: BRAND.colors.accentDeep.replace("#", ""),
              }
            : null,
          // Caption below the chart, mirroring the on-screen preview.
          // Shifts right when the dummy chip occupies the left slot.
          caption: slide.chartData!.caption
            ? {
                text: slide.chartData!.caption,
                x: slide.chartData!.isDummyData ? 9.3 : 7.7,
                y: HEADING_ACCENT_Y + 4.4,
                w: slide.chartData!.isDummyData ? 3.3 : 4.9,
                h: 0.35,
                color: BRAND.colors.ink500.replace("#", ""),
              }
            : null,
        }
      : null,
    // Gold delineation dash directly under the heading (title-body separator)
    headingAccent: {
      x: 0.75,
      y: HEADING_ACCENT_Y,
      w: 0.7,
      h: HEADING_ACCENT_H,
      fill: BRAND.colors.accent.replace("#", ""),
    },
    // Small Valon watermark bottom-right (mirrors on-screen preview)
    watermark: {
      text: "valon",
      x: 11.4,
      y: 6.85,
      w: 1.5,
      h: 0.4,
      fontFace: BRAND.pptxFonts.serif,
      fontSize: 13,
      italic: true,
      color: BRAND.colors.ink500.replace("#", ""),
      align: "right" as const,
    },
    accentBar: {
      x: 0.75,
      y: 6.95,
      w: 0.5,
      h: 0.05,
      fill: BRAND.colors.accent.replace("#", ""),
    },
  };
}

export type PptxSlideSpec = ReturnType<
  typeof renderTitleSlide | typeof renderSectionSlide | typeof renderContentSlide
>;

export function mapSlide(slide: Slide) {
  switch (slide.layout) {
    case "title":
      return renderTitleSlide(slide);
    case "section":
      return renderSectionSlide(slide);
    case "content":
      return renderContentSlide(slide);
  }
}

export function mapDeck(deck: Deck) {
  return {
    title: deck.title,
    slides: deck.slides.map(mapSlide),
    dimensions: { width: SLIDE_W, height: SLIDE_H },
  };
}

/**
 * Slugify a deck title for use as a filename.
 */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "valon-deck"
  );
}
