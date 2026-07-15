# Decisions

What was found in the starter repo, what was built, what was deliberately
not built, and why. Written to be read alongside the code.

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

**Templates as scaffolds.** Each template is a slide-by-slide outline
(layout, heading, hint) injected into the draft prompt. The model writes
copy; the template shapes structure. Floor of first-draft quality goes up
without decks feeling stamped from a mold.

**Brand check on demand, not in the loop.** An automatic eval pass on every
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
