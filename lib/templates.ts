/**
 * Deck templates. Each template carries a suggested team/audience, a
 * target length, and a slide-by-slide outline that the draft prompt
 * uses as scaffolding. The model still writes the actual copy; the
 * template just shapes structure so a new user gets a professionally
 * shaped deck on the first draft.
 */

import type { Audience, Deck, Slide, SlideLayout, Team } from "./types";
import { makeId } from "./types";

export type TemplateOutlineSlide = {
  layout: SlideLayout;
  heading: string;
  hint: string;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  defaultTeam: Team;
  defaultAudience: Audience;
  targetLength: number;
  outline: TemplateOutlineSlide[];
};

export const BLANK_TEMPLATE_ID = "blank" as const;

export const TEMPLATES: Template[] = [
  {
    id: "investor-update",
    name: "Investor Update",
    description: "Quarterly external update for investors and board observers.",
    defaultTeam: "executive-board",
    defaultAudience: "external",
    targetLength: 8,
    outline: [
      { layout: "title", heading: "Quarterly investor update title", hint: "Deck cover: quarter and year, e.g. 'Q4 2026 Investor Update'." },
      { layout: "content", heading: "Headline results", hint: "3 to 4 tight bullets with the top-line numbers of the quarter (ARR, growth rate, key wins). Numbers are the star." },
      { layout: "content", heading: "Financial performance", hint: "Revenue and ARR trend, ideally as a chart. Include chartData with quarterly bars." },
      { layout: "content", heading: "Operational highlights", hint: "2 to 4 bullets on product, customer, and team milestones. Not commentary, just what shipped and landed." },
      { layout: "content", heading: "Pipeline and forward outlook", hint: "Named or anonymized upcoming deals with ARR estimates and timing. Bullets or chartData for pipeline value." },
      { layout: "section", heading: "What's next", hint: "One-line divider setting up the forward-looking half." },
      { layout: "content", heading: "Strategic priorities next quarter", hint: "3 focused priorities, each in one sentence. No jargon." },
      { layout: "content", heading: "Asks and support", hint: "How investors can help this quarter (intros, hires, references). Specific, not vague." },
    ],
  },
  {
    // Id kept as "board-read" (the template's original name): saved decks
    // reference templates by id, so renaming it would orphan them.
    id: "board-read",
    name: "Board Update",
    description: "Structured board update: metrics, decisions, risks, asks.",
    defaultTeam: "executive-board",
    defaultAudience: "internal",
    targetLength: 10,
    outline: [
      { layout: "title", heading: "Board update title", hint: "Deck cover: month/quarter and year, e.g. 'Board Update, November 2026'." },
      { layout: "content", heading: "Executive summary", hint: "3 to 5 bullets: state of the business, what's on track, what's at risk, decisions needed today." },
      { layout: "content", heading: "Key metrics dashboard", hint: "Chart of primary KPI trend (ARR, active accounts, or platform volume). Use chartData." },
      { layout: "content", heading: "Customer and revenue update", hint: "New logos, expansions, churn commentary. Bullets, precise." },
      { layout: "content", heading: "Product and engineering update", hint: "What shipped this period, what's next, meaningful KPIs (uptime, latency, feature adoption)." },
      { layout: "content", heading: "Hiring and org update", hint: "Headcount by function, key hires closed, open searches. A small chart or clean bullets." },
      { layout: "content", heading: "Financial snapshot", hint: "Cash on hand, runway, burn trend. Include a chart if the trend matters." },
      { layout: "section", heading: "Risks and decisions", hint: "Divider slide setting up the second half." },
      { layout: "content", heading: "Top risks and mitigations", hint: "3 to 5 risks in a table-like bullet format: risk, likelihood, mitigation. Honest, not performative." },
      { layout: "content", heading: "Decisions requested from the board", hint: "Specific asks with context: what, why, by when. One per line." },
    ],
  },
  {
    id: "gtm-pipeline-review",
    name: "GTM Pipeline Review",
    description: "Monthly pipeline health, wins, losses, and forecast for GTM.",
    defaultTeam: "gtm",
    defaultAudience: "internal",
    targetLength: 8,
    outline: [
      { layout: "title", heading: "GTM pipeline review title", hint: "Deck cover: month and year, e.g. 'GTM Pipeline Review, November 2026'." },
      { layout: "content", heading: "Pipeline snapshot", hint: "Top-line pipeline value, weighted pipeline, coverage ratio. Chart of pipeline by stage." },
      { layout: "content", heading: "This period: wins and losses", hint: "Closed-won by ARR, closed-lost with reason codes. 3-5 bullets, specific accounts if useful." },
      { layout: "content", heading: "Top of funnel", hint: "New logos in the pipe, source attribution. Chart of pipeline value by source." },
      { layout: "content", heading: "Sales cycle and velocity", hint: "Average sales cycle by segment, trending direction. Chart if it moved meaningfully." },
      { layout: "content", heading: "Forecast next 90 days", hint: "Commit, best-case, stretch. 2-4 named or anonymized deals expected to close." },
      { layout: "content", heading: "Blockers and asks", hint: "Where the team needs support (product features, ops, exec sponsorship). Specific." },
      { layout: "content", heading: "Action items", hint: "5 or fewer action items, each owned by a named function or role." },
    ],
  },
  {
    id: "product-launch-brief",
    name: "Product Launch Brief",
    description: "Announcement brief for a product launch: what, why, how, when.",
    defaultTeam: "product-engineering",
    defaultAudience: "internal",
    targetLength: 8,
    outline: [
      { layout: "title", heading: "Product launch title", hint: "Deck cover: product name and launch date, e.g. 'Escrow Self-Service, December 2026'." },
      { layout: "content", heading: "What we're launching", hint: "One paragraph summary in 2-3 bullets. Non-jargon, clear scope." },
      { layout: "content", heading: "Why now", hint: "Customer pain, market timing, strategic fit. 3 bullets, honest not marketing-speak." },
      { layout: "content", heading: "Target users and use cases", hint: "Who this is for and the 2-3 core use cases. Bullets." },
      { layout: "content", heading: "How it works", hint: "3-4 bullets on the mechanics or an illustration. Do not deep-dive; leave that for docs." },
      { layout: "content", heading: "Success metrics", hint: "The 3 metrics we will judge success by, with baselines. Chart-friendly." },
      { layout: "content", heading: "Rollout plan", hint: "Phased rollout with dates and cohort sizes. Bullets or a mini-timeline." },
      { layout: "content", heading: "Team, credits, and asks", hint: "Who built it, thanks, and what other teams need to do to support." },
    ],
  },
  {
    id: "new-ventures-pitch",
    name: "New Ventures Pitch",
    description: "Internal pitch for a new venture or expansion bet.",
    defaultTeam: "new-ventures",
    defaultAudience: "internal",
    targetLength: 9,
    outline: [
      { layout: "title", heading: "New ventures pitch title", hint: "Deck cover: venture codename or working title, and the ask (explore / build / launch)." },
      { layout: "content", heading: "The thesis in one paragraph", hint: "What we believe about the market and why now. 2-3 bullets that read as a coherent argument." },
      { layout: "content", heading: "Market and customer", hint: "TAM/SAM estimate (chart-friendly), customer segments, evidence of pull." },
      { layout: "content", heading: "The wedge", hint: "The specific product or offering we would build first. Concrete, not aspirational." },
      { layout: "content", heading: "Why Valon wins", hint: "The unfair advantage: data, distribution, existing customers, platform reuse. 3 bullets." },
      { layout: "content", heading: "Competitive landscape", hint: "Who is playing here and how we differ. 3 to 5 named competitors or categories, one line each." },
      { layout: "content", heading: "Business model and unit economics", hint: "How this makes money. Simple numbers or an illustrative chart. Set isDummyData: true if numbers are directional." },
      { layout: "content", heading: "Path to first revenue", hint: "6-month plan with 3 milestones. Concrete owners and dates." },
      { layout: "content", heading: "Ask", hint: "Specific ask: team, budget, exec air cover, timeline. One sentence per line." },
    ],
  },
  {
    id: "quarterly-planning",
    name: "Quarterly Planning",
    description: "Set goals, initiatives, capacity, and risks for the coming quarter.",
    defaultTeam: "executive-board",
    defaultAudience: "internal",
    targetLength: 9,
    outline: [
      {
        layout: "title",
        heading: "Quarterly planning deck title",
        hint: "Deck cover: quarter and year, e.g. 'Q1 2027 Planning'. Subheading can name the leadership team or offsite (e.g. 'Leadership offsite, January 2027').",
      },
      {
        layout: "content",
        heading: "Where we ended last quarter",
        hint: "3 to 5 bullets: top KPIs vs plan (ARR, active accounts, key operational metrics), what beat, what missed, what carried over. Numbers over adjectives.",
      },
      {
        layout: "content",
        heading: "Themes for the coming quarter",
        hint: "3 to 5 strategic themes in one line each. These are the frames that everything else in the deck maps to. No jargon.",
      },
      {
        layout: "content",
        heading: "Goals and success metrics",
        hint: "The measurable outcomes for the quarter. Each goal has a metric and a target. Chart-friendly if trending against prior quarters. Set isDummyData: true for illustrative targets.",
      },
      {
        layout: "content",
        heading: "Initiatives and owners",
        hint: "Table-like bullet format: initiative, owner (function or named exec), delivery date. 5 to 8 initiatives, ranked by strategic weight.",
      },
      {
        layout: "content",
        heading: "Capacity and headcount plan",
        hint: "Headcount by function, planned adds, backfills. Chart of headcount over time or by team, if the shift matters this quarter.",
      },
      {
        layout: "content",
        heading: "Dependencies and risks",
        hint: "3 to 5 top risks with mitigations, cross-team dependencies, external factors (regulatory, macro, customer). Honest, not performative.",
      },
      {
        layout: "section",
        heading: "How we'll run the quarter",
        hint: "Divider setting up the operating rhythm section.",
      },
      {
        layout: "content",
        heading: "Operating rhythm and reviews",
        hint: "Cadence: weekly leadership stand-up, monthly business review, mid-quarter checkpoint, end-of-quarter review. Named owners for each. One line each.",
      },
    ],
  },
  {
    id: "product-release-notes",
    name: "Product Release Notes",
    description: "Communicate a Valon platform release to customers: what changed, why, and what to do.",
    defaultTeam: "product-engineering",
    defaultAudience: "external",
    targetLength: 8,
    outline: [
      {
        layout: "title",
        heading: "Release title",
        hint: "Deck cover: product name and version, e.g. 'Valon OS v9.1'. Subheading is the release date and a one-line theme (e.g. 'January 2027 · Servicing scale and AI reliability').",
      },
      {
        layout: "content",
        heading: "What's new at a glance",
        hint: "3 to 5 top-line bullets summarizing the release. Written for a busy customer who wants to know 'do I need to pay attention to this one?' in 20 seconds.",
      },
      {
        layout: "content",
        heading: "New capabilities",
        hint: "User-facing features shipped this release. 3 to 4 bullets, each with the feature name and the customer-visible benefit. Plain-spoken, no marketing adjectives.",
      },
      {
        layout: "content",
        heading: "Under the hood",
        hint: "Infrastructure, performance, and reliability improvements. Concrete numbers where possible: latency reduction, uptime, throughput. Chart-friendly if a trend improved.",
      },
      {
        layout: "content",
        heading: "AI capability updates",
        hint: "What changed in the AI components this release: new model versions, evaluation results, guardrails, human-in-the-loop policies. Systems-card style. Honest about limitations.",
      },
      {
        layout: "content",
        heading: "Reliability, security, and compliance",
        hint: "Uptime for the period, any relevant SOC 2 / audit updates, regulatory attestations, security fixes. 3 to 5 bullets. This slide is table-stakes for a regulated-finance release.",
      },
      {
        layout: "content",
        heading: "What you need to do",
        hint: "Concrete action items for the customer: migration steps, deprecations with dates, configuration changes, breaking changes if any. Ranked by urgency. If nothing is required, say so plainly.",
      },
      {
        layout: "content",
        heading: "What's next",
        hint: "Short teaser of the next release theme and 2 to 3 items in flight. Plus where to send questions (release notes URL, support contact, dedicated Slack). One line each.",
      },
    ],
  },
  {
    id: "partner-pitch-new-vertical",
    name: "Partner Pitch: New Vertical",
    description: "External pitch to a design partner in an adjacent regulated finance vertical.",
    defaultTeam: "new-ventures",
    defaultAudience: "external",
    targetLength: 9,
    outline: [
      {
        layout: "title",
        heading: "Partner discussion title",
        hint: "Deck cover: partner name (or category) and a subheading like 'Extending the Valon platform to [vertical]'. If the brief names a specific partner or vertical, use it in the title.",
      },
      {
        layout: "content",
        heading: "The pattern we've proven in mortgage servicing",
        hint: "3 bullets on what Valon built for mortgage servicing: AI-native platform, compliance-first architecture, and the concrete outcomes (billions in UPB serviced, cost per loan reduction, CSAT). Numbers over adjectives.",
      },
      {
        layout: "content",
        heading: "Why the same pattern applies to [target vertical]",
        hint: "The structural similarity: complex regulation, servicing-heavy operations, legacy tech, high cost-to-serve. 3 bullets that map mortgage pain 1:1 to the target vertical's pain.",
      },
      {
        layout: "content",
        heading: "What we would build together",
        hint: "The specific product surface for this vertical, not a rehash of mortgage. Concrete first workflows, integrations, target use cases. 3 to 4 bullets, no jargon.",
      },
      {
        layout: "content",
        heading: "How we differ from existing options",
        hint: "3 to 4 named incumbents or categories in the target vertical, and how the Valon approach differs. Positioning, not competitor-bashing. One line each.",
      },
      {
        layout: "content",
        heading: "Illustrative impact",
        hint: "A chart showing what impact a Valon-style platform could have in this vertical (e.g. cost per unit serviced, cycle time, error rate). Set isDummyData: true unless the partner already shared numbers. Use chartData.",
      },
      {
        layout: "section",
        heading: "What we're asking",
        hint: "Divider setting up the ask.",
      },
      {
        layout: "content",
        heading: "Design partner engagement",
        hint: "What design-partner status means concretely: data-sharing scope, product co-design cadence, launch commitment, pricing during the design phase. 3 to 5 bullets.",
      },
      {
        layout: "content",
        heading: "Team, credentials, and next 90 days",
        hint: "Brief on who's building this (Valon leadership, funding, mortgage customers as proof). 2 to 3 bullets on the team plus 3 concrete milestones for the next 90 days with dates.",
      },
    ],
  },
];

export function templateById(id: string | null | undefined): Template | null {
  if (!id || id === BLANK_TEMPLATE_ID) return null;
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Format a template's outline as a scaffold block for the draft prompt.
 * The model uses this to lay out the deck, but is free to adjust wording
 * and adapt to the brief.
 */
export function templateOutlineBlock(template: Template): string {
  const lines = [
    "",
    `Template: "${template.name}". Use this outline as the deck skeleton. Adapt the wording of each heading to the specific brief, but keep the ordering and intent unless the brief clearly requires otherwise.`,
    "",
    ...template.outline.map((slide, i) => {
      const num = String(i + 1).padStart(2, "0");
      return `${num}. [${slide.layout}] ${slide.heading}\n    Hint: ${slide.hint}`;
    }),
    "",
    `Produce roughly ${template.outline.length} slides. Match the template's slide count within +/- 2.`,
  ];
  return lines.join("\n");
}

// -------- Custom templates --------

/**
 * Caps for user-authored templates. Custom templates live in the
 * browser's localStorage (invisible to the server), so they travel in
 * the draft request body, and their text is injected into the draft
 * prompt; every field is length-capped at the trust boundary, same
 * reasoning as CONTEXT_DOC_CHAR_CAP.
 */
export const TEMPLATE_LIMITS = {
  name: 80,
  description: 200,
  heading: 150,
  hint: 400,
  outlineMax: 20,
} as const;

/**
 * Derive a reusable template from a finished deck. Pure structure
 * extraction: reads only the presence and shape of slide content
 * (bullet counts, chart type, series count, image presence), never
 * values: no base64 image payloads and no chart numbers land in the
 * template, so it stays a tiny text blob and last quarter's figures
 * never steer next quarter's draft. Headings are copied verbatim:
 * templateOutlineBlock already instructs the model to adapt the wording
 * of each heading to the new brief while keeping ordering and intent.
 */
export function deriveTemplateFromDeck(deck: Deck, name: string): Template {
  return {
    id: makeId("custom"),
    name: name.trim().slice(0, TEMPLATE_LIMITS.name),
    description: `Saved from "${deck.title}".`.slice(0, TEMPLATE_LIMITS.description),
    defaultTeam: deck.team,
    defaultAudience: deck.audience,
    targetLength: deck.slides.length,
    outline: deck.slides.map((slide) => ({
      layout: slide.layout,
      heading: slide.heading.trim().slice(0, TEMPLATE_LIMITS.heading),
      hint: deriveHint(slide).slice(0, TEMPLATE_LIMITS.hint),
    })),
  };
}

/**
 * Assemble a hint from what the slide contains, in the register of the
 * built-in hints: they tell the model what kind of content belongs in
 * the slot, not what the content was.
 */
function deriveHint(slide: Slide): string {
  const parts: string[] = [];
  if (slide.layout === "title") parts.push("Deck cover.");
  if (slide.layout === "section") parts.push("Divider slide.");
  if (slide.subheading?.trim()) {
    parts.push(
      slide.layout === "section"
        ? "Include one line of context."
        : "Include a short subtitle."
    );
  }
  if (slide.bullets.length > 0) {
    parts.push(
      `${slide.bullets.length} tight bullet${slide.bullets.length === 1 ? "" : "s"}.`
    );
  }
  if (slide.chartData) {
    const seriesCount = slide.chartData.series.length;
    parts.push(
      `Include chartData (${slide.chartData.type}${seriesCount > 1 ? `, ${seriesCount} series` : ""}). Set isDummyData true unless the brief provides real numbers.`
    );
  }
  if (slide.imageIdea?.trim()) {
    parts.push("Supporting editorial illustration.");
  }
  if (parts.length === 0) parts.push("Short, focused slide.");
  return parts.join(" ");
}
