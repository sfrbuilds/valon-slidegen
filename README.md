# Valon SlideGen v0

Internal Valon tool for drafting presentations through conversation. Users
describe what they need, pick a team and audience, then iterate with Gemini
in a chat-first interface while previewing the deck live. Export as editable
PowerPoint.

## Context

SlideGen v0 builds on an earlier internal prototype,
[valon-presentation-takehome](https://github.com/kylerussell-valon/valon-presentation-takehome):
a working seed that could generate slides with Gemini and export a
PowerPoint file. This repo keeps that foundation and rebuilds the three
areas that limited what could be built on top of it:

1. **Prompt transparency.** Image generation was steered by a style
   appendix appended to prompts out of sight. Every instruction sent to
   the model now lives in one documented module (`lib/prompts.ts`);
   nothing is added elsewhere.
2. **Editable output.** Export rendered each slide as a single flat image
   with the text baked in. Export now produces native PowerPoint objects:
   every text box, bullet, and chart remains editable after download.
3. **A structured slide model.** The original model was too thin to
   represent layouts, charts, tones, or templates. A typed domain model
   replaced it, validated at the trust boundary before any model output
   becomes app state.

From there, the feature set below was built on the new foundation. What
was kept, what was replaced, and what was deliberately not built is
recorded in [DECISIONS.md](./DECISIONS.md).

## Setup

```bash
npm install
cp .env.example .env.local
# add your Gemini API key to .env.local
npm run dev
```

Open http://localhost:3000 (or pass `-p 3001` if 3000 is taken).

```bash
npm run typecheck   # strict TypeScript, no emit
npm test            # vitest unit tests on the pure lib/ layer
```

## Features

- **Draft from a brief**: team, audience, up to three optional reference documents
  (PDF / DOCX / TXT / MD), optional template. Eight tone profiles, one per
  team x audience pair, previewable at setup.
- **Eight deck templates** with slide-by-slide outlines (Investor Update,
  Board Update, GTM Pipeline Review, Product Launch Brief, New Ventures Pitch,
  Quarterly Planning, Product Release Notes, Partner Pitch: New Vertical).
  Outlines shape structure; the model writes the copy.
- **Chat revision, slide or deck scope**: "This slide" revises the selected
  slide; "Whole deck" sends the full deck for a coherent global edit.
  Multi-turn history rides along so iterative asks keep context. Charts and
  images can be added, changed, or removed conversationally.
- **Native editable charts**: bar / line, single or multi-series, value
  labels, y-axis titles, captions, exported as fully editable chart
  objects. When the model fabricates numbers it must set
  `isDummyData: true`, which renders a visible "Illustrative data" chip on
  screen and in the export; claimed-real values are verified against the
  brief, reference documents, and the user's chat messages
  (`lib/chart-grounding.ts`) and overridden to illustrative when
  ungrounded.
- **Review on demand**: a reviewer pass that judges every slide against
  the deck's tone rules and a factual-grounding rubric (company-specific
  claims must be supported by the brief, reference documents, or the
  user's chat messages), returning a pass / needs-revision verdict and
  findings tied to slide numbers. On-demand by design, so drafting stays
  fast. "Fix findings" runs one bounded repair pass (smallest edit per
  finding, logged in chat) and re-checks once.
- **Inline editing**: click any heading, subheading, or bullet on the slide.
  Slide rail with add / delete / drag-to-reorder.
- **Editorial images**: optional Gemini-generated illustrations, brand style
  enforced by a documented style layer, never text baked into images.
- **Export**: .pptx download; every text box, bullet, and chart is an
  editable object.

## Architecture

- Next.js 15 App Router, React 19, TypeScript strict mode.
- Gemini for text drafting and image generation (`lib/gemini.ts`), with
  `responseSchema` locking JSON shapes at the model level
  (`lib/model-response-schemas.ts`).
- Everything from the model passes `lib/deck-validation.ts` validation before
  becoming app state. Nothing is trusted raw.
- Chart intent detection (`lib/chart-intent.ts`) is a hint, not an enforcer:
  narrow patterns, one retry with a forcing directive on a miss, then a
  visible warning. A good draft is never discarded over a missing chart.
- localStorage persistence behind a storage interface (`lib/deck-storage.ts`)
  for a future cloud swap.
- PPTX export is a pure mapping (`lib/pptx-map.ts`) fed to pptxgenjs.

## Key files

- `lib/types.ts` - domain model
- `lib/writing-tones.ts` - 8 team x audience tone definitions
- `lib/deck-templates.ts` - 8 deck templates with slide-by-slide outlines
- `lib/prompts.ts` - all Gemini prompts, documented
- `lib/model-response-schemas.ts` - Gemini responseSchema definitions
- `lib/chart-intent.ts` - chart intent and removal detection
- `lib/deck-validation.ts` - JSON validation for AI outputs
- `lib/pptx-map.ts` - deck-to-pptx mapping
- `lib/design-tokens.ts` - brand tokens (colors, fonts, spacing)
- `lib/__tests__/` - unit tests for the pure lib layer
- `app/api/draft|redraft|redraft-deck|image|eval|export` - API routes

## Product thesis

Internal tool for any Valon team (New Ventures, GTM, Product & Engineering,
Executive & Board) to draft decks for internal or external audiences.
Conversation-first: after a one-time setup, everything is chat with a live
slide preview. Iterate on slides individually or the whole deck.

Designed around concrete recurring jobs: a GTM/growth person building a
quarterly pipeline review (hence first-class charts), a Chief of Staff
preparing a board update or investor update (hence the Executive & Board
tone and the "Illustrative data" guard), Product & Engineering writing a
launch brief or release notes, New Ventures pitching a partner. Team x
audience and template selection change the prompts, so the same brief
produces a different deck for each job. Light edits (inline text, slide
reorder, chat revision) happen in-app so export is the last step, not
the start of a second editing pass. Full rationale in
[DECISIONS.md](./DECISIONS.md); requirements, KPIs, and release plan in
[PRD.md](./PRD.md).
