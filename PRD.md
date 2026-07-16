# PRD: Valon SlideGen v0

July 2026. States what the product is, why it exists, who it serves, and
when it ships. Decision rationale lives in [DECISIONS.md](./DECISIONS.md);
features, setup, and architecture in [README.md](./README.md).

## 1. Overview & objectives

**Problem.** Valon teams produce the same decks on a recurring cadence
(board reads, investor updates, pipeline reviews, launch briefs) and each
one starts from a blank slide. The drafting is slow, the tone drifts by
author, and the numbers-heavy decks that quarterly reporting demands need
charts that generic AI slide tools either can't produce or bake into
images nobody can edit.

**Product.** An internal tool that drafts presentations through
conversation: describe the deck, pick team and audience, iterate in chat
against a live preview, export as fully editable PowerPoint / Google
Slides. Gemini writes; the user stays the editor of record.

**Objectives / KPIs** *(proposed at v0, targets to be validated at the
July 22 review and instrumented in the iteration sprint)*:

| KPI | Target |
|---|---|
| Time from brief to exportable first draft | < 5 minutes |
| Created decks that reach export | ≥ 60% |
| Monthly active creators, first month post-launch | ≥ 30 individuals (~6% of a ~470-person org) |
| Team spread among those creators | ≥ 3 of 4 Valon teams |
| Time saved per recurring deck vs. manual drafting | ≥ 2 hours |

**ROI / value model** *(illustrative planning math, to be replaced with
measured usage during the iteration sprint)*:

| Input | Estimate |
|---|---|
| Manual drafting time, recurring deck | 3 to 4 h |
| With SlideGen (draft + chat revisions + light edits) | ~1 h |
| Time returned per deck | 2 to 3 h |
| Decks/month at target adoption (30 creators × ~2) | ~60 |
| Hours returned per month | 120 to 180 h |
| Loaded internal cost, blended across the named personas | $150/h (conservative; a CoS or GTM lead at a fintech runs above this) |
| **Monthly value of returned time** | **$18k to $27k** |
| Model cost per deck lifecycle (draft, revisions, review, images) | on the order of $0.50 |
| Monthly run cost at target volume (tokens + hosted deployment) | < $100 |
| Build investment: ~3 builder-weeks with AI-assisted development (1 week v0 + 2-week iteration sprint) | ~$18k one-time |

The savings are scoped to drafting mechanics: structure, first copy,
formatting, chart construction. The strategic content of the deck stays
with the author, and the tool does not claim to save that time.

The full equation: a one-time build investment of roughly $18k against
$18k to $27k of returned time per month at target adoption. At full
adoption the build pays back within the first month; on a conservative
ramp (half of target adoption in month one) it pays back within two.
From that point the tool generates $18k to $27k per month in recurring
savings, roughly $215k to $325k per year, against a run cost of under
$100 per month. The client-facing takeaway: **the economics are driven
by adoption, not by token spend**, which is why the adoption KPIs, not
the model bill, are the numbers to manage.

## 2. Target users

Primary personas, each mapped to the recurring deck job that shaped the
product (not hypothetical: these drove the template set and tone system):

- **GTM / growth lead** preparing a quarterly pipeline review. Pain:
  chart-heavy, number-driven decks take hours; generic tools can't do
  editable charts. → "GTM Pipeline Review" template, chart primitive.
- **Chief of Staff / exec** assembling a board read or investor update.
  Pain: highest-stakes audience, zero tolerance for invented figures or
  off-register tone. → "Board Read" / "Investor Update" templates,
  Executive & Board tone, mandatory dummy-data labeling.
- **Product & Engineering lead** writing a launch brief or release notes.
  Pain: translating internal work into audience-appropriate copy. →
  "Product Launch Brief" / "Product Release Notes" templates.
- **New Ventures lead** pitching internally or to a partner in an
  adjacent vertical. → "New Ventures Pitch" / "Partner Pitch" templates.

Secondary: any Valon team with a recurring deck format, served by custom
templates (save any deck's structure for reuse) rather than by expanding
the built-in set.

## 3. Features & functional requirements

Each feature with its acceptance criteria.

**Draft from a brief.** User provides a brief, team, audience; optional
reference document (PDF/DOCX/TXT/MD), template, and slide count.
*Accepts:* a complete deck renders in the workspace; every slide passes
schema validation before becoming state; deck length follows the brief by
default (a brief that says "6 slides: slide 1…, slide 2…" yields exactly
that), with explicit counts and templates as opt-in overrides.

**Eight tone profiles (team × audience).** Rules and avoid-lists differ
in kind, not degree, per pair; injected into every draft and revision
prompt. *Accepts:* full rules visible at setup (hover); same brief
produces materially different copy across pairs.

**Templates.** Eight built-in slide-by-slide outlines plus user-created
templates ("Save as template" derives structure from any deck: layouts,
headings, content shape, never values, so no chart numbers and no image
payloads). *Accepts:* custom templates appear on the landing grid with a
Custom tag, hover outline preview, and delete; drafting through one
follows its structure; the outline travels in the request and is
validated server-side (unknown layouts and oversized outlines reject
with a 400).

**Chat revision, slide or deck scope.** Multi-turn history rides along;
whole-deck edits merge by stable slide identity so reorders, inserts, and
deletions keep images attached to the right content. *Accepts:* "remove
the chart" removes it (explicit removal detection); a missing requested
chart degrades to a visible warning after one retry, never a failed
draft.

**Native editable charts.** Bar/line, single or multi-series; fabricated
numbers carry `isDummyData: true` (parser defaults to true) and render an
"Illustrative data" chip on screen and in the export. *Accepts:* charts
land in PowerPoint and Google Slides as chart objects, editable after
upload.

**Review (internal name: eval).** On-demand pass judging every slide
against the deck's tone rules; findings quote offending copy and jump to
the slide; "Fix findings" runs one bounded minimal-edit pass, logged in
chat, then re-checks once. *Accepts:* flags only clear, material
violations; never auto-iterates to green.

**Inline editing & slide rail.** Click-to-edit headings, subheadings,
bullets; add / delete / drag-to-reorder slides. *Accepts:* light edits
complete in-app so export is the last step, not the start of a second
editing pass.

**Export.** Native .pptx (every text box, bullet, chart an editable
object) plus an "Open in Google Slides" interop path. *Accepts:* no text
baked into images, ever.

**Technical constraints.** Next.js 15 / React 19 / TypeScript strict;
Gemini for all runtime AI (text + image); all prompts centralized in
`lib/prompts.ts`; nothing model-returned becomes state without a parser
in `lib/deck-schema.ts`; localStorage behind a storage interface; 502
only for unusable model output, degradable problems return warnings.

## 4. UX/UI

No separate wireframes; v0 is its own reference. Three surfaces:

- **Landing** (`/`): prompt-first creation form (brief → template grid →
  team/audience with tone preview → length → reference doc) above the
  deck library.
- **Workspace** (`/decks/[id]`): slide rail left, editable canvas center,
  chat right; header actions (Save as template, Review, Google Slides,
  Export) with Export as the single primary action.
- **About** (`/about`): what it does, what to watch for, brief-writing
  guidance.

Design language: warm cream / espresso ink / single gold accent; inline
styles over CSS variables from `globals.css`; no UI dependencies.
Fabrication warnings (Illustrative data) and review verdicts use the same
chip vocabulary everywhere.

## 5. Assumptions & dependencies

- **Gemini API** (text + image) is the sole runtime AI dependency; a
  `GOOGLE_API_KEY` in `.env.local` is required. Model output quality and
  latency bound the product experience.
- **Anthropic API key is a development-tool credential only** (Claude
  Code); never imported into app runtime.
- **Single user, single browser**: persistence is localStorage; no
  accounts, no sync. Known limit: base64 images can hit the quota (writes
  fail loudly; IndexedDB is the graduation path).
- **Localhost-only by design** for v0; no hosting or deployment config.
- **pptxgenjs** fidelity bounds export; Google Slides interop is via
  file upload, not API integration.
- **unpdf / mammoth** for reference-document extraction.

## 6. Out of scope (v0)

Deliberate exclusions, with rationale in DECISIONS.md:

- **Web search grounding.** Hallucinated financials with borrowed
  authority is the worst failure mode for investor decks. If ever built:
  opt-in, per-slide, attributed.
- **Model and effort selection.** Letting the user choose between models
  or reasoning-effort levels per draft. Desirable for cost/quality
  control at scale; out of scope for v0 because one well-tuned model
  keeps the surface simple and the tone system depends on consistent
  model behavior. Revisit with usage data.
- **Multi-agent orchestration.** No visible product difference at this
  scale; adds latency and failure modes.
- **Hosting, auth, DB.** Take-home constraint; the storage interface
  keeps the swap one file.
- **Undo/redo, presentation mode, image cropping.** Polish without
  leverage on the core loop (draft → revise → export).
- **Template sharing/marketplace, template versioning.** Custom
  templates are personal, browser-local.
- **Anthropic models in app runtime.** Explicit constraint.

## 7. Release plan & timeline

*(Dates from July 22 onward are illustrative for planning purposes.)*

| Date | Milestone |
|---|---|
| Jul 14-21, 2026 | v0 development |
| **Jul 21** | **v0 initial release: submission to the panel** |
| **Jul 22** | **Prototype presentation + joint panel review** (this PRD's KPIs, ROI model, and scope are inputs to that discussion) |
| Jul 23 - Aug 5 | Iteration sprint: panel feedback, KPI instrumentation, hardening (candidate items: IndexedDB image storage, real-data chart ingestion, hosted deployment with auth) |
| ~Aug 6 | Second review touchpoint: go / no-go on launch scope |
| Late Aug 2026 | Planned launch / go-live to Valon teams |

Testing gates throughout: `npm run typecheck` and `npm test` (unit tests
on the pure `lib/` layer) green before any milestone; live end-to-end
draft/revise/export verification before each release.
