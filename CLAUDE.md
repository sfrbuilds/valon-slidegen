# Claude Code instructions for valon-slidegen-v0

## Project

Valon SlideGen: internal tool that drafts presentation decks through
chat (pick team + audience + template, iterate against a live preview,
export editable PPTX / Google Slides).

Next.js 15 App Router + React 19 + TypeScript strict. Gemini for app
runtime (text + image). No DB, no auth: localStorage behind the interface
in `lib/deck-storage.ts`. Do not add hosting or deployment config; this app is
localhost-only by design.

## Hard rules

- Every prompt sent to Gemini lives in `lib/prompts.ts`. Never concatenate
  prompt fragments elsewhere, never hide instructions in other modules.
- Every Gemini responseSchema lives in `lib/model-response-schemas.ts`.
- Nothing from the model becomes app state without passing a parser in
  `lib/deck-validation.ts`. If you add a model-returned field, add validation
  and a test.
- Fabricated chart numbers must carry `isDummyData: true`. The parser
  defaults to true when the field is missing, and the routes verify an
  explicit false against the user's own text (`lib/chart-grounding.ts`):
  ungrounded claims are overridden to true. Never weaken either layer.
- The Anthropic API key is a dev-tool credential only. Never import an
  Anthropic SDK into app code.
- Never commit API keys. `.env.local` is gitignored; keep it that way.

## Conventions

- `lib/` stays pure and testable: no React, no fetch, no Next imports
  (except `deck-store.tsx`, the one React file there).
- API routes are thin: parse request, build prompt, call Gemini, validate,
  merge, respond. Business rules (merge semantics, intent detection) belong
  in `lib/`.
- Chart/visual intent detection: patterns must be word-bounded and narrow.
  Test any new pattern against "paragraph", "raise the bar", and "mom"
  before adding it. Detection is a hint that drives one retry, never a
  hard failure.
- Errors: 502 only for unusable model output. Degradable problems (missing
  requested chart) return a `warning` string on a 200.
- UI style: inline styles with CSS variables from `globals.css`. Warm
  cream / espresso ink / single gold accent. No new dependencies for UI.

## Checks

```bash
npm run typecheck
npm test
```

Run both before considering any change done.
