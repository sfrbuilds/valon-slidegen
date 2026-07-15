/**
 * Valon brand tokens as TypeScript constants.
 * Real tokens sampled from valon.ai.
 * Referenced by pptx-map.ts, image prompts, and (via globals.css) the UI.
 */

export const BRAND = {
  colors: {
    // Base surfaces
    paperWhite: "#FFFFFF",
    paperWarm1: "#F6F1EA",
    paperWarm2: "#F3E9DD",
    paperWarm3: "#F1E1D0",

    // Ink family
    ink900: "#141210",
    ink700: "#2B241D",
    ink500: "#5A5148",
    ink300: "#9B948B",
    ink100: "#E5E1DA",

    // Accent (wordmark sunburst gold)
    accent: "#D89A4E",
    accentDeep: "#B8722E",
    accentSoft: "#E4B180",

    // Semantic
    success: "#3A6B4B",
    warning: "#C88B2C",
    error: "#9C3E3E",
    info: "#3B4A5A",
  },
  fonts: {
    // Serif italic is reserved for the Valon wordmark; all display and
    // slide type is the sans. Automation for regulated industries reads
    // engineered, not editorial.
    serif: '"Instrument Serif", Georgia, serif',
    sans: '"Instrument Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    mono: '"Geist Mono", "SF Mono", Menlo, monospace',
  },
  // PPTX-specific font names (serif only used by the wordmark watermark)
  pptxFonts: {
    serif: "Georgia",
    sans: "Aptos",
  },
} as const;
