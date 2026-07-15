/**
 * Core domain types for Valon SlideGen v0.
 *
 * Everything the app operates over is defined here. Runtime data (localStorage
 * blobs, API payloads, Gemini responses) is validated at the trust boundary
 * before becoming values of these types.
 */

// -------- Enums / string unions --------

export const TEAMS = [
  "new-ventures",
  "gtm",
  "product-engineering",
  "executive-board",
] as const;
export type Team = (typeof TEAMS)[number];

export const TEAM_LABELS: Record<Team, string> = {
  "new-ventures": "New Ventures",
  "gtm": "GTM (Sales & Marketing)",
  "product-engineering": "Product & Engineering",
  "executive-board": "Executive & Board",
};

export const AUDIENCES = ["internal", "external"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  internal: "Internal",
  external: "External",
};

export const SLIDE_LAYOUTS = ["title", "section", "content"] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

// Composed tone id: `{team}--{audience}`
// e.g. "new-ventures--internal", "gtm--external"
export type ToneId = `${Team}--${Audience}`;

export function toneIdFor(team: Team, audience: Audience): ToneId {
  return `${team}--${audience}` as ToneId;
}

// -------- Tone --------

export type Tone = {
  id: ToneId;
  team: Team;
  audience: Audience;
  name: string;
  description: string;
  rules: string[];
  avoid: string[];
};

// -------- Chart --------

export const CHART_TYPES = ["bar", "line"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export type ChartSeries = {
  name: string;
  values: number[];
};

export type ChartData = {
  type: ChartType;
  labels: string[]; // x-axis categories, e.g. ["Q1", "Q2", "Q3", "Q4"]
  series: ChartSeries[];
  caption?: string;
  yAxisLabel?: string;
  // Set to true whenever the numbers are fabricated by the model or a
  // placeholder from the app. The slide displays a visible "Illustrative
  // data" chip so nobody screenshots a made-up figure into a real deck.
  isDummyData: boolean;
};

// -------- Slide --------

export type Slide = {
  id: string;
  layout: SlideLayout;
  // Layout: title
  //   heading: deck title
  //   subheading: optional subtitle
  // Layout: section
  //   heading: one big statement
  //   subheading: optional context
  // Layout: content
  //   heading: slide title
  //   bullets: 2 to 5 tight bullets
  //   imageIdea: optional short prompt for supporting imagery
  //   chartData: optional chart on the right side of the slide (alt to imageIdea)
  heading: string;
  subheading?: string;
  bullets: string[];
  imageIdea?: string;
  imageData?: string; // base64 data URL if image has been generated
  chartData?: ChartData; // alt to image; if present, renders a chart
  speakerNotes?: string;
};

// -------- Chat message (multi-turn conversation) --------

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

// Scope determines whether a chat message applies to a specific slide or the
// whole deck. Slide-scoped messages only appear in that slide's thread.
// Deck-scoped messages appear in the deck-level thread and are visible to
// all slides for context.
export const CHAT_SCOPES = ["slide", "deck"] as const;
export type ChatScope = (typeof CHAT_SCOPES)[number];

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string; // ISO 8601
  scope: ChatScope;
  slideId?: string; // required when scope is "slide"
  // Optional metadata for assistant messages describing what changed
  editSummary?: string;
};

// -------- Context document --------

export const CONTEXT_DOC_CHAR_CAP = 40_000;

export type ContextDoc = {
  filename: string;
  text: string;
  truncated: boolean;
  uploadedAt: string; // ISO 8601
};

// -------- Deck --------

export type Deck = {
  id: string;
  title: string;
  team: Team;
  audience: Audience;
  brief: string;
  targetLength: number; // number of slides at draft time
  contextDoc: ContextDoc | null;
  templateId: string | null; // e.g. "investor-update" or null for blank/custom
  slides: Slide[];
  chatHistory: ChatMessage[]; // full multi-turn history for this deck
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
};

// -------- Eval / brand-check --------

export const EVAL_VERDICTS = ["on-brand", "needs-revision"] as const;
export type EvalVerdict = (typeof EVAL_VERDICTS)[number];

export type EvalFinding = {
  slideNumber: number | null; // null when finding is deck-level
  issue: string;
};

export type EvalRun = {
  id: string;
  deckId: string;
  deckTitle: string;
  contextFilename: string | null;
  trigger: "draft" | "redraft";
  verdict: EvalVerdict;
  findings: EvalFinding[];
  timestamp: string; // ISO 8601
};

// -------- API payloads --------

export type DraftDeckRequest = {
  brief: string;
  team: Team;
  audience: Audience;
  targetLength: number;
  contextDoc: ContextDoc | null;
  templateId?: string | null;
};

export type DraftDeckResponse = {
  deckTitle: string;
  slides: Slide[];
  // Non-fatal notice, e.g. a requested chart was not produced after a retry.
  // The deck is still returned; a good draft is never discarded over it.
  warning?: string;
};

export type RedraftSlideRequest = {
  deck: Pick<Deck, "id" | "title" | "team" | "audience" | "brief" | "contextDoc">;
  slide: Slide;
  slideNumber: number;
  totalSlides: number;
  instruction: string;
  neighborHeadings: string[];
  chatHistory: ChatMessage[]; // full deck + slide history at time of call
};

export type RedraftSlideResponse = {
  slide: Slide;
  editSummary: string;
  // Non-fatal notice, e.g. a requested chart was not produced after a retry.
  warning?: string;
};

export type RedraftDeckRequest = {
  deck: Pick<Deck, "id" | "title" | "team" | "audience" | "brief" | "contextDoc">;
  slides: Slide[];
  instruction: string;
  chatHistory: ChatMessage[];
};

export type RedraftDeckResponse = {
  slides: Slide[];
  editSummary: string;
  warning?: string;
};

export type EvalRequest = {
  deck: Pick<Deck, "id" | "title" | "team" | "audience" | "brief" | "contextDoc">;
  slides: Slide[];
  trigger: "draft" | "redraft";
};

export type EvalResponse = {
  evalRun: EvalRun;
};

// -------- Utilities --------

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
