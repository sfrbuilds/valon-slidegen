# Valon SlideGen v0

Internal Valon tool for drafting presentations through conversation. Users
describe what they need, pick a team and audience, then iterate with Gemini
in a chat-first interface while previewing the deck live. Export as editable
PowerPoint.

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

## What the starter repo shipped, and what was fixed

The seed app worked, but three patterns undermined it. All three are removed
in this fork (details and rationale in [DECISIONS.md](./DECISIONS.md)):

1. A hidden `HOUSE_STYLE_APPENDIX` appended to every image prompt, forcing
   Comic Sans / clip-art aesthetics into generated images.
2. Slide export rendered each slide as one full-bleed image with the text
   baked in: nothing was editable after export.
3. A minimal slide data model that could not represent structure (layouts,
   charts, speaker notes), so every downstream feature hit a ceiling.

This fork replaces them with a structured slide model, prompts collected in
one documented file (`lib/prompts.ts`, nothing hidden), and a PPTX export
where every text box and chart is a native, editable object.

## Features

- **Draft from a brief**: team, audience, optional reference document
  (PDF / DOCX / TXT / MD), optional template. Eight tone profiles, one per
  team x audience pair, previewable at setup.
- **Eight deck templates** with slide-by-slide outlines (Investor Update,
  Board Read, GTM Pipeline Review, Product Launch Brief, New Ventures Pitch,
  Quarterly Planning, Product Release Notes, Partner Pitch: New Vertical).
  Outlines shape structure; the model writes the copy.
- **Chat revision, slide or deck scope**: "This slide" revises the selected
  slide; "Whole deck" sends the full deck for a coherent global edit.
  Multi-turn history rides along so iterative asks keep context. Charts and
  images can be added, changed, or removed conversationally.
- **Native editable charts**: bar / line, single or multi-series, value
  labels, y-axis titles, captions. Charts land editable in PowerPoint and
  Google Slides. When the model fabricates numbers it must set
  `isDummyData: true`, which renders a visible "Illustrative data" chip on
  screen and in the export.
- **Review on demand**: a reviewer pass that judges every slide against
  the deck's tone rules and returns findings tied to slide numbers. On-demand
  by design, so drafting stays fast. "Fix findings" runs one bounded repair
  pass (smallest edit per finding, logged in chat) and re-checks once.
- **Inline editing**: click any heading, subheading, or bullet on the slide.
  Slide rail with add / delete / drag-to-reorder.
- **Editorial images**: optional Gemini-generated illustrations, brand style
  enforced by a documented style layer, never text baked into images.
- **Export**: .pptx download plus an "Open in Google Slides" interop path.

## Architecture

- Next.js 15 App Router, React 19, TypeScript strict mode.
- Gemini for text drafting and image generation (`lib/gemini.ts`), with
  `responseSchema` locking JSON shapes at the model level
  (`lib/response-schemas.ts`).
- Everything from the model passes `lib/deck-schema.ts` validation before
  becoming app state. Nothing is trusted raw.
- Chart intent detection (`lib/chart-intent.ts`) is a hint, not an enforcer:
  narrow patterns, one retry with a forcing directive on a miss, then a
  visible warning. A good draft is never discarded over a missing chart.
- localStorage persistence behind a storage interface (`lib/storage.ts`)
  for a future cloud swap.
- PPTX export is a pure mapping (`lib/pptx-map.ts`) fed to pptxgenjs.

## Key files

- `lib/types.ts` — domain model
- `lib/tones.ts` — 8 team x audience tone definitions
- `lib/templates.ts` — 8 deck templates with slide-by-slide outlines
- `lib/prompts.ts` — all Gemini prompts, documented
- `lib/response-schemas.ts` — Gemini responseSchema definitions
- `lib/chart-intent.ts` — chart intent and removal detection
- `lib/deck-schema.ts` — JSON validation for AI outputs
- `lib/pptx-map.ts` — deck-to-pptx mapping
- `lib/brand.ts` — brand tokens (colors, fonts, spacing)
- `lib/__tests__/` — unit tests for the pure lib layer
- `app/api/draft|redraft|redraft-deck|image|eval|export` — API routes

## Product thesis

Internal tool for any Valon team (New Ventures, GTM, Product & Engineering,
Executive & Board) to draft decks for internal or external audiences.
Conversation-first: after a one-time setup, everything is chat with a live
slide preview. Iterate on slides individually or the whole deck.

Designed around concrete recurring jobs: a GTM/growth person building a
quarterly pipeline review (hence first-class charts), a Chief of Staff
preparing a board read or investor update (hence the Executive & Board
tone and the "Illustrative data" guard), Product & Engineering writing a
launch brief or release notes, New Ventures pitching a partner. Team x
audience and template selection change the prompts, so the same brief
produces a different deck for each job. Light edits — inline text, slide
reorder, chat revision — happen in-app so export is the last step, not
the start of a second editing pass. Full rationale in
[DECISIONS.md](./DECISIONS.md).
