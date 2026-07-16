# Decisions

What was found in the starter repo, what was built, what was deliberately
not built, and why. Written to be read alongside the code.

## What this is, and who it is for

Valon SlideGen drafts presentation decks through conversation: describe
the deck, pick team and audience, iterate in chat against a live preview,
export as editable PowerPoint or Google Slides.

**Designed from jobs to be done, not a feature list.** The product starts
from concrete recurring deck jobs inside Valon, and each job shaped a
specific decision:

- A GTM or growth person preparing a **quarterly pipeline review**: the
  "GTM Pipeline Review" template, and the reason chart generation is a
  first-class primitive rather than an afterthought: a pipeline review
  without charts is not a deliverable.
- A Chief of Staff assembling a **board read or investor update**: the
  "Board Read" and "Investor Update" templates, the Executive & Board
  tone (leads with numbers and decisions), and the `isDummyData` guard,
  because a fabricated figure in that deck is the worst possible failure.
- Product & Engineering shipping a **launch brief or release notes**:
  "Product Launch Brief", "Product Release Notes".
- New Ventures **pitching internally or to a partner**: "New Ventures
  Pitch", "Partner Pitch: New Vertical".

The eight templates encode the decks we infer recur on the leadership
cadence of a company shaped like Valon: a hypothesis built from the team
structure and common operating rhythms, not from user interviews.

**Output changes with who is presenting and to whom.** Team x audience
selects one of eight tone profiles (`lib/tones.ts`) whose rules and
avoid-lists are injected into every drafting and revision prompt; the
chosen template (`lib/templates.ts`) injects a slide-by-slide structural
outline. The same brief produces a materially different deck for GTM
external than for Executive & Board internal, by design, not by prompt
luck. Details in "Eight tones, not three voices" and "Templates as
scaffolds" below.

**Charts and images are core, not garnish.** Quarterly reviews and
investor updates are chart-driven documents, so charts are a typed
primitive in the domain model, survive export as native editable objects,
and get their own intent detection and honesty labeling. Generated images
are the inverse: editorial, optional, and never load-bearing.

**Light edits happen in-app, before export.** The exported file should
not be the first place a user can fix a word. Inline text editing on the
slide, a rail with add / delete / drag-to-reorder, and chat revision at
slide or deck scope mean the deck leaves the app presentation-ready:
export is the last step, not the start of a second editing job in
PowerPoint.

## Found in the starter repo

**1. Hidden image-prompt appendix.** The image generation path silently
appended a `HOUSE_STYLE_APPENDIX` to every prompt, steering output toward
Comic Sans and clip-art aesthetics. Removed. Replacement: a single
documented brand style layer in `lib/prompts.ts` (`BRAND_STYLE_LAYER`),
applied openly. Rule adopted for the whole app: every prompt sent to the
model lives in `lib/prompts.ts`. Nothing is concatenated elsewhere, nothing
is hidden.

**2. Text baked into exported images.** Export rendered each slide as one
full-bleed image, text included, so the "PowerPoint" was a picture of a
deck. Replaced with a structured slide model mapped to native pptxgenjs
objects: text boxes, bullets, charts. Everything in the export is editable,
and charts remain editable after upload to Google Slides.

**3. Minimal slide model.** The seed's data model could not represent
layouts, charts, or notes, which capped every downstream feature. Replaced
with a typed domain model (`lib/types.ts`) validated at the trust boundary
(`lib/deck-schema.ts`): nothing from the model becomes state without
passing validation.

## Built, and why

**Structured output over prose parsing.** Gemini `responseSchema` locks
JSON shape at the model level (`lib/response-schemas.ts`), and a hand-rolled
validator still checks everything, because schema conformance is not
semantic correctness (equal label/value lengths, finite numbers, known
layouts).

**Chart primitive with `isDummyData`.** When the model fabricates numbers,
the schema requires `isDummyData: true` and the UI and PPTX export both show
an "Illustrative data" chip. Fabricated figures should never silently look
real in a board deck. The parser defaults to `true` when the model omits the
field: conservative by default.

**Chart provenance is verified, not trusted.** A live test showed the
model charting [19, 21, 23, 25] as real data when the brief contained
only the 25: a brief with SOME figures read as license to mark a whole
interpolated series `isDummyData: false`, and the parser accepted the
claim. The model's provenance claim is now a hint, like chart intent:
`lib/chart-grounding.ts` extracts every numeric token from the brief,
reference document, and the user's own chat messages, and any chart
claiming real data whose plotted values are not all present in that
source text is overridden to illustrative before the response leaves the
route. Assistant messages are excluded from the source so model-invented
numbers cannot ground themselves on a later turn. Deliberately
conservative: a value the model derived arithmetically stays labeled
illustrative, because mislabeling a real number costs a chip while
mislabeling an invented one costs trust. Prose has no equivalent
mechanical check, so the drafting prompts carry a factual-grounding
block: no invented metrics, percentages, dates, or names; missing
figures become "[data needed: ...]" placeholders; years are never
inferred.

**Chart intent as hint, not enforcer.** Keyword detection appends a forcing
directive and drives a single retry when the model returns no chart. After
that it degrades to a visible warning. Two earlier failure modes were
designed out: overly broad patterns (`/graph/` matching "paragraph",
`/\bbar\b/` matching "raise the bar") forcing charts onto unrelated edits,
and a hard 502 that discarded an otherwise good draft over one missing
chart.

**Deck-scope chat.** "Whole deck" sends the full deck in one call and
merges by stable identity: each slide's id travels to the model as
`sourceSlideId`, the response schema requires it back, and the merge
matches by id (`lib/deck-merge.ts`). Inserted, removed, and reordered
slides keep ids and generated images attached to the right content;
invented or duplicated ids are treated as new slides, and a full schema
miss falls back to positional merging. One call keeps global edits
coherent (a per-slide loop cannot shorten a deck or keep terminology
consistent).

**Removal semantics.** Models are lazy about echoing unchanged fields, so
the redraft route preserves an existing visual the model omitted. That
default would make "remove the chart" impossible, so removal intent is
detected explicitly and the omission is then honored as a deliberate clear.

**Eight tones, not three voices.** Tone is team x audience because the
rules differ in kind, not degree: "Executive & Board internal" leads with
numbers and decisions; "GTM external" bans internal acronyms and false
urgency. Each pair carries its own avoid-list. The full rules render at
setup, so the system is visible product surface, not hidden prompt text.

**Deck length follows the brief by default.** The form originally forced
a slide count, which bulldozed users who had already structured the deck
in the brief ("6 slides: slide 1 this, slide 2 that"): the forced
"produce exactly 8" won over their concept. Default is now Auto: the
model sizes the deck from the brief and must follow any stated count or
slide-by-slide structure exactly. Explicit counts remain as opt-in chips,
and templates still set their own length.

**Templates as scaffolds.** Each template is a slide-by-slide outline
(layout, heading, hint) injected into the draft prompt. The model writes
copy; the template shapes structure. Floor of first-draft quality goes up
without decks feeling stamped from a mold.

**Review on demand, not in the loop.** (User-facing name "Review"; the
internal name is eval, kept by the `/api/eval` route and `EvalRun`
types.) An automatic eval pass on every
draft adds latency and a second failure mode to the critical path. As a
button, it costs nothing until asked, and findings quote the offending copy
with slide numbers that jump to the slide. "Fix findings" closes the loop
when the user asks: one bounded pass that applies the smallest edit per
finding through the deck-revision route, logged in chat like any other
edit, followed by a single automatic re-check. Deliberately not
iterate-until-green: repeated silent rewrites hide changes from the author
of a board deck, and the author stays the editor.

**localStorage behind an interface.** The take-home excludes hosting, so no
DB and no auth. `lib/storage.ts` isolates persistence so a real backend is
a one-file swap. Known pressure point: generated images are base64 strings
and can hit the localStorage quota, so writes return success/failure and
the UI warns when an image could not be persisted. IndexedDB is the right
home for image payloads when persistence graduates.

## Deliberately not built

**Web search grounding.** Real risk of hallucinated financial numbers
landing in investor decks with borrowed authority. If built, it should be
an opt-in per-slide "pull in market context" action, clearly attributed.

**Multi-agent orchestration.** Single agent with tight prompts and locked
response schemas covers this product at this scale. Orchestration would add
latency and failure modes without a visible product difference.

**Undo/redo, presentation mode, image cropping.** Polish with no leverage
on the core loop (draft, revise, export). The inline editor plus chat
history covers most recovery cases.

**Anthropic in the app runtime.** Explicit take-home constraint: the
Anthropic key is for Claude Code as a development tool only. App runtime is
Gemini end to end.
