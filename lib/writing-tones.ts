/**
 * Tone definitions for Valon SlideGen v0.
 *
 * Eight tones, one per team x audience combination. Rules drive drafting,
 * revision, and eval (brand check). Full definitions live here; the same
 * rules are surfaced in the setup UI so users can preview what each
 * combination will produce.
 */

import type { Tone, Team, Audience, ToneId } from "./types";
import { toneIdFor } from "./types";

export const TONES: Tone[] = [
  {
    id: "new-ventures--internal",
    team: "new-ventures",
    audience: "internal",
    name: "New Ventures - Internal",
    description:
      "Candid engagement updates and learnings for Valon leadership and cross-functional teams.",
    rules: [
      "Lead with what worked and what did not; no burnishing.",
      "Name specific clients, deals, and terms where appropriate.",
      "Flag risks and blockers plainly; no corporate cushioning.",
      'Use first-person plural where natural ("we saw", "we tried", "we missed").',
      "Internal acronyms (ValonOS, MSP, DUS, MSR) are fine without explanation.",
      "Short declarative sentences; minimum ceremony.",
    ],
    avoid: [
      "Sales language and positioning-speak.",
      'Vague "learnings" without concrete detail.',
      "Throat-clearing intros and filler phrases.",
    ],
  },
  {
    id: "new-ventures--external",
    team: "new-ventures",
    audience: "external",
    name: "New Ventures - External",
    description:
      "Client-facing kickoffs, 90-day plans, engagement briefs, and delivery updates.",
    rules: [
      "Speak as an expert partner, not a vendor.",
      "Explain internal terms (ValonOS, servicing platform) on first use.",
      "Structure around client outcomes, not Valon capabilities.",
      "Confident but not salesy; no over-claiming.",
      "Respect the client's domain expertise; do not condescend.",
      "Address the specific decisions the client needs to make.",
    ],
    avoid: [
      '"Revolutionary", "game-changing", "unlock your..." language.',
      "Feature-list-heavy language.",
      "Urgent CTAs and time-pressure phrasing.",
    ],
  },
  {
    id: "gtm--internal",
    team: "gtm",
    audience: "internal",
    name: "GTM - Internal",
    description:
      "Pipeline updates, deal reviews, GTM strategy briefings for internal audiences.",
    rules: [
      "Lead with numbers (pipeline value, close rates, cycle times, ARR).",
      "Name specific deals, stages, and next steps.",
      "Flag deals at risk with concrete reasons.",
      'Celebrate specifics ("closed X for $Y"), not superlatives.',
      "Include forward-looking asks explicitly.",
      "Direct; no throat-clearing.",
    ],
    avoid: [
      "Hedging on pipeline.",
      "Vague commentary and sales-report gloss.",
      "Corporate cushioning of missed numbers.",
    ],
  },
  {
    id: "gtm--external",
    team: "gtm",
    audience: "external",
    name: "GTM - External",
    description:
      "Sales decks, RFP responses, customer materials, prospect briefings.",
    rules: [
      "Benefits before features; say what it means for the customer.",
      'Address the reader directly as "you".',
      "Trust-building; use concrete customer outcomes as evidence.",
      "No internal acronyms unless explained in plain words.",
      "Confident but not pushy; no false urgency, no time-pressure CTAs.",
      "Match the buyer's vocabulary, not Valon-internal jargon.",
    ],
    avoid: [
      '"Revolutionize", "leverage", "world-class" buzzwords.',
      "Superlatives, hype, and over-promising.",
      "Marketing-glossy language.",
    ],
  },
  {
    id: "product-engineering--internal",
    team: "product-engineering",
    audience: "internal",
    name: "Product & Engineering - Internal",
    description:
      "Technical roadmaps, architecture decisions, launch briefs, and product reviews for internal audiences.",
    rules: [
      "Precise; name specific systems, tools, and constraints.",
      "Include tradeoffs alongside recommendations.",
      "Flag risks, unknowns, and open questions.",
      "Short sentences; minimum ceremony.",
      "Use ADR framing where appropriate (context / decision / consequences).",
      "Internal jargon is fine.",
    ],
    avoid: [
      "Marketing language.",
      "Feature-list decks without decisions.",
      "Hand-waving over hard tradeoffs.",
    ],
  },
  {
    id: "product-engineering--external",
    team: "product-engineering",
    audience: "external",
    name: "Product & Engineering - External",
    description:
      "Technical documentation for customers, integration briefings, security and compliance reviews.",
    rules: [
      "Clear; explain technical terms or provide references.",
      "Document assumptions and constraints explicitly.",
      "Credible, non-marketing tone.",
      "Show, don't tell: use concrete examples where helpful.",
      "Address the specific technical decision the reader needs to make.",
      "Respect the reader's technical sophistication.",
    ],
    avoid: [
      "Marketing-glossy language.",
      "Hand-waving.",
      '"We can support any use case" language.',
      "Over-claiming security or scale.",
    ],
  },
  {
    id: "executive-board--internal",
    team: "executive-board",
    audience: "internal",
    name: "Executive & Board - Internal",
    description:
      "Board updates, strategic reviews, executive-level briefings for internal audiences.",
    rules: [
      "Lead with the number and the takeaway.",
      "Every slide leads with its single takeaway; cut detail that does not change a decision.",
      "Numbers-first; back every claim with concrete data.",
      "Direct and decisive; no throat-clearing.",
      "Flag risks and opportunities with clarity.",
      'Include the "so what" and the "what next".',
    ],
    avoid: [
      "Buzzwords and corporate euphemisms.",
      "Burying the takeaway under exhaustive detail on a slide.",
      "Filler and ceremony.",
    ],
  },
  {
    id: "executive-board--external",
    team: "executive-board",
    audience: "external",
    name: "Executive & Board - External",
    description:
      "Annual updates, investor letters, external positioning narratives.",
    rules: [
      "Aspirational but credible; anchor claims in real numbers.",
      "Humanize with concrete stories and specifics.",
      "Address current investors' or stakeholders' actual concerns.",
      "Confident about progress; honest about challenges.",
      "Long-arc framing; treat readers as sophisticated.",
      "Match the register of a high-quality institutional letter.",
    ],
    avoid: [
      "Hype.",
      "Superlatives without evidence.",
      "Sanitized-away misses.",
      "Marketing-brochure vibes.",
    ],
  },
];

export function getTone(team: Team, audience: Audience): Tone {
  const id = toneIdFor(team, audience);
  const tone = TONES.find((t) => t.id === id);
  if (!tone) {
    throw new Error(`Unknown tone: ${id}`);
  }
  return tone;
}

export function getToneById(id: ToneId): Tone {
  const tone = TONES.find((t) => t.id === id);
  if (!tone) {
    throw new Error(`Unknown tone: ${id}`);
  }
  return tone;
}

/**
 * Compose the tone block that gets injected into every draft / redraft /
 * eval prompt.
 */
export function toneBlock(tone: Tone): string {
  const lines = [
    `Tone: "${tone.name}" - ${tone.description}`,
    "Rules:",
    ...tone.rules.map((r) => `- ${r}`),
    "Avoid:",
    ...tone.avoid.map((a) => `- ${a}`),
  ];
  return lines.join("\n");
}
