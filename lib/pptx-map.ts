/**
 * Deck to PPTX mapping. Pure function: takes a Deck, returns a spec that
 * pptx-map's caller feeds to pptxgenjs. Text and images are placed as
 * separate layers (never text baked into images).
 */

import type { Deck, Slide } from "./types";
import { BRAND } from "./design-tokens";

// Widescreen slide dimensions in inches (pptxgenjs LAYOUT_WIDE)
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

// Layout: title
function renderTitleSlide(slide: Slide) {
  // 50pt line is ~0.8in; stack the subtitle and dash under the actual
  // heading height so a wrapping title never crowds them.
  const headingLines = estimateLines(slide.heading, 11.83, 50, 3, true);
  const headingH = 0.1 + headingLines * 0.8;
  const headingY = headingLines > 2 ? 2.2 : 2.8;
  const subY = headingY + headingH + 0.1;
  const dashY = subY + (slide.subheading ? 0.95 : 0.2);
  return {
    layout: "title" as const,
    background: BRAND.colors.paperWhite,
    texts: [
      {
        text: slide.heading,
        x: 0.75,
        y: headingY,
        w: 11.83,
        h: headingH,
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
              y: subY,
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
      y: dashY,
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

/**
 * Estimate how many lines a text run wraps to at a given font size in a
 * box of the given width. Average glyph width is calibrated against real
 * exports, separately per weight because bold runs wider:
 * - bold 32pt in an 11.83in box wraps between 48 and 51 characters,
 *   giving ~0.55x the font size per glyph;
 * - regular 18pt wraps around 93 characters, giving ~0.52x.
 * Ties go to the taller box: an overestimated box costs a sliver of
 * whitespace, an underestimated one prints boxes over each other.
 */
function estimateLines(
  text: string,
  widthInches: number,
  fontSizePt: number,
  maxLines: number,
  bold: boolean
): number {
  const charWidthPt = (bold ? 0.55 : 0.52) * fontSizePt;
  const charsPerLine = Math.max(8, Math.floor((widthInches * 72) / charWidthPt));
  return Math.min(maxLines, Math.max(1, Math.ceil(text.length / charsPerLine)));
}

// Layout: content
function renderContentSlide(slide: Slide) {
  const hasChart = Boolean(slide.chartData);
  const hasImage = Boolean(slide.imageData) && !hasChart;
  const hasSideVisual = hasChart || hasImage;
  // A visual with no bullets takes the full slide width below the
  // heading instead of leaving an empty text column (mirrors the
  // preview layout).
  const visualOnly = hasSideVisual && slide.bullets.length === 0;
  const contentWidth = hasSideVisual && !visualOnly ? 6.7 : 11.83;
  const visualX = visualOnly ? 0.75 : 7.7;
  const visualW = visualOnly ? 11.83 : 4.9;
  // The heading box hugs the estimated text height; the dash and body
  // are placed relative to it, so a single-line heading pulls the whole
  // slide body up instead of leaving a gap under the headline.
  const HEADING_Y = 0.55;
  const HEADING_LINE_H = 0.55;
  const HEADING_H =
    0.1 + estimateLines(slide.heading, contentWidth, 32, 3, true) * HEADING_LINE_H;
  const HEADING_ACCENT_Y = HEADING_Y + HEADING_H + 0.05;
  const HEADING_ACCENT_H = 0.05;
  const bodyTop = slide.subheading
    ? HEADING_ACCENT_Y + 0.55
    : HEADING_ACCENT_Y + 0.35;
  // Bullets stack cumulatively: each row is sized from its own estimated
  // wrap count (18pt line is ~0.34in), so a three-line bullet pushes the
  // next bullet down instead of printing over it (the fixed 0.72in step
  // assumed single-line bullets and overlapped on wordy decks).
  const BULLET_LINE_H = 0.34;
  const BULLET_GAP = 0.14;
  let bulletY = bodyTop;
  const bulletBoxes = slide.bullets.map((bullet) => {
    const lines = estimateLines(bullet, contentWidth - 0.3, 18, 5, false);
    const h = 0.06 + lines * BULLET_LINE_H;
    const y = bulletY;
    bulletY += h + BULLET_GAP;
    return { bullet, y, h };
  });
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
      ...bulletBoxes.map(({ bullet, y, h }) => ({
        text: bullet,
        x: 0.75,
        y,
        w: contentWidth,
        h,
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
          x: visualX,
          y: HEADING_ACCENT_Y + 0.05,
          w: visualW,
          h: 4.3,
        }
      : null,
    chart: hasChart
      ? {
          data: slide.chartData!,
          x: visualX,
          y: HEADING_ACCENT_Y + 0.05,
          w: visualW,
          h: 4.3,
          dummyChip: slide.chartData!.isDummyData
            ? {
                text: "Illustrative data",
                x: visualX,
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
                x: slide.chartData!.isDummyData ? visualX + 1.6 : visualX,
                y: HEADING_ACCENT_Y + 4.4,
                w: slide.chartData!.isDummyData ? visualW - 1.6 : visualW,
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
