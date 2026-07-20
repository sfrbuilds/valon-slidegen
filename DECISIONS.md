# Decisions

The key decisions behind Valon SlideGen V0: the product it is meant to be,
what was built and why, and what waits for later releases. Written to be
read alongside the code.

## What this is, and who it is for

Valon SlideGen drafts presentation decks through conversation: describe
the deck, pick team and audience, iterate in chat against a live preview,
export an editable PowerPoint file (.pptx).

The product is designed around recurring deck jobs inside Valon, not a
feature list:

- **GTM / Growth**: quarterly pipeline reviews ("GTM Pipeline Review"
  template).
- **Chief of Staff / Executive**: board updates and investor updates
  ("Board Update", "Investor Update" templates).
- **Product & Engineering**: launch briefs and release notes ("Product
  Launch Brief", "Product Release Notes").
- **New Ventures**: internal and partner pitches ("New Ventures Pitch",
  "Partner Pitch: New Vertical").

The eight built-in templates encode the decks we infer recur on the
leadership cadence of a company shaped like Valon: a hypothesis built
from the team structure and common operating rhythms, not from user
interviews.

## First decision: remove critical flaws in the starter repo

Before any feature work, three failures in the starter repo had to go,
because each one capped everything built on top of it:

- **Hidden image-prompt appendix.** Image generation silently appended a
  house-style appendix steering output toward Comic Sans and clip-art
  aesthetics. Removed and replaced with one documented brand style layer
  (`BRAND_STYLE_LAYER`), applied openly. Rule adopted app-wide: every
  prompt sent to the model lives in `lib/prompts.ts`; nothing is
  concatenated elsewhere, nothing is hidden.
- **Text baked into exported images.** Export rendered each slide as one
  full-bleed image, text included, so the "PowerPoint" was a picture of
  a deck. Replaced with a structured slide model mapped to native
  pptxgenjs objects (text boxes, bullets, charts): everything in the
  export is editable.
- **Minimal slide model.** The seed's data model could not represent
  layouts, charts, or notes. Replaced with a typed domain model
  (`lib/types.ts`) validated at the trust boundary
  (`lib/deck-validation.ts`): nothing from the model becomes app state
  without passing validation.

## Key product decisions

- **Assist PowerPoint and Slides, do not replace them.** Users make
  light edits in-app before export: inline text editing on the slide, a
  rail with add / delete / drag-to-reorder, and chat revision at slide
  or deck scope. The exported file should not be the first place a user
  can fix a word.
- **Charts are first-class, not garnish.** Board updates, investor
  updates, and pipeline reviews are chart-driven documents, so charts
  are a typed primitive with their own intent detection, honesty
  labeling, and native editable export. Generated images are the
  inverse: editorial, optional, never load-bearing.
- **Fabricated numbers are always labeled.** Any chart value the app
  cannot trace back to the user's own material carries an "Illustrative
  data" chip, in the UI and in the export. A fabricated figure that
  silently looks real in a board deck is the worst possible failure.
  Mechanics under "Chart provenance" below.
- **Review on demand.** A "Review" button runs an AI QA pass over the
  deck, checking grounding and tone, with findings that jump to the
  offending slide and a bounded "Fix findings" action. On demand rather
  than automatic: a review pass on every draft would add latency and a
  second failure mode to the critical path.
- **Templates for recurring jobs, including the user's own.** The eight
  built-in templates cover the jobs above. "Save as template" turns any
  finished deck into a reusable outline, so next quarter's version of
  the same deck starts from this quarter's structure.
- **Tone follows team and audience.** Team x audience selects one of
  eight tone profiles (`lib/writing-tones.ts`), each with its own rules and
  avoid-list: "Executive & Board internal" leads with numbers and
  decisions, "GTM external" bans internal acronyms and false urgency.
  The full rules render at setup, so tone is visible product surface,
  not hidden prompt text.
- **Deck length follows the brief.** Default is Auto: the model sizes
  the deck from the brief and must follow any stated count or
  slide-by-slide structure exactly. An earlier forced slide count
  bulldozed users who had already structured the deck in the brief.
  Explicit counts remain as opt-in chips, and templates set their own
  length.

## Key engineering decisions

- **Structured output over prose parsing.** Gemini `responseSchema`
  locks JSON shape at the model level (`lib/model-response-schemas.ts`), and a
  hand-rolled validator still checks everything, because schema
  conformance is not semantic correctness (equal label/value lengths,
  finite numbers, known layouts).
- **Chart provenance is verified, not trusted.**
  - The schema carries `isDummyData`; the parser defaults it to `true`
    when the model omits the field. Conservative by default.
  - A live test showed the model charting [19, 21, 23, 25] as real data
    when the brief contained only the 25. So the model's claim is
    treated as a hint: `lib/chart-grounding.ts` checks every plotted
    value against the numbers in the brief, reference documents, and the
    user's own chat messages, and overrides any chart that fails to
    illustrative before the response leaves the route.
  - Assistant messages are excluded as a source, so model-invented
    numbers cannot ground themselves on a later turn. Values the model
    derived arithmetically stay labeled illustrative: mislabeling a real
    number costs a chip, mislabeling an invented one costs trust.
  - Known limitation, documented in the module and pinned in tests:
    this is numeric provenance, not semantic grounding. It verifies each
    value appears somewhere in the source, not that it belongs to the
    metric the chart claims.
- **Prose grounding lives in the prompts, re-checked by review.** Prose
  has no mechanical check, so the drafting prompts carry a
  factual-grounding block: no invented metrics, dates, or names; no
  unsupported qualitative claims (an assertion of traction or exceeded
  targets is a business fact even without a number); industry context
  only as hypothesis or question; missing figures become
  "[data needed: ...]" placeholders; and a closing self-check against
  the brief. Live regression runs showed these rules move the model from
  reliably fabricating filler to mostly writing placeholders with
  occasional slips, which is why the review pass repeats the same rubric
  as an independent second check.
- **The review judges grounding, not just tone.** The review rubric
  checks every company-specific claim against the brief, reference
  document, and the user's own chat messages, with assistant messages
  excluded for the same reason as in chart grounding. "Fix findings" is
  one bounded pass plus a single automatic re-check, deliberately not
  iterate-until-green: repeated silent rewrites would hide changes from
  the author of a board deck. (User-facing name "Review"; the internal
  name is eval, kept by the `/api/eval` route and `EvalRun` types.)
- **Chart intent is a hint, not an enforcer.** Keyword detection drives
  a single retry when a requested chart is missing, then degrades to a
  visible warning. Patterns are word-bounded and narrow after `/graph/`
  matched "paragraph", and a missing chart never returns a 502 that
  discards an otherwise good draft.
- **Deck edits merge by stable identity.** "Whole deck" chat sends the
  full deck in one call; each slide's id round-trips as `sourceSlideId`
  and the merge matches by id (`lib/deck-merge.ts`). Inserted, removed,
  and reordered slides keep generated images attached to the right
  content; invented or duplicated ids become new slides, and a full
  schema miss falls back to positional merging. One call keeps global
  edits coherent; a per-slide loop cannot shorten a deck or keep
  terminology consistent.
- **Removal is detected, omission is forgiven.** Models are lazy about
  echoing unchanged fields, so the redraft route preserves a visual the
  model omitted. Because that default would make "remove the chart"
  impossible, removal intent is detected explicitly and the omission is
  then honored as a deliberate clear.
- **localStorage behind an interface.** The take-home excludes hosting,
  so no DB and no auth. `lib/deck-storage.ts` isolates persistence so a real
  backend is a one-file swap. Known pressure point: base64 images can
  hit the localStorage quota, so writes return success/failure, the UI
  warns when an image could not be persisted, and a failed write at deck
  creation surfaces an error instead of navigating to a deck that was
  never stored. IndexedDB is the right home for image payloads when
  persistence graduates.

## Out of scope for V0

Planned for later releases:

- **Slack integration.** Mention @slidegen in a channel with a brief and
  get the .pptx back in the thread. Strongest candidate for the next
  release: decks already start as chat, and Slack is where the request
  usually originates.
- **Cloud deployment.** V0 runs locally by design (the take-home
  excludes hosting). The storage interface and thin API routes are the
  seams a hosted version would swap.
- **Model selection and effort level.** V0 runs Gemini end to end. A
  later release should let users pick the runtime model (Gemini, OpenAI,
  Anthropic) and an effort level per deck. In this take-home the
  Anthropic key is a development-tool credential only and never enters
  the app runtime.
- **Google Slides integration.** An earlier "Open in Google Slides"
  button downloaded the same .pptx as Export and opened an empty
  slides.google.com tab. It promised an integration that did not exist,
  so it was removed rather than renamed. The later-release version is a
  real Drive API upload.

Considered and rejected for V0:

- **Web search grounding.** Real risk of hallucinated financial numbers
  landing in investor decks with borrowed authority. If built, it should
  be an opt-in per-slide "pull in market context" action, clearly
  attributed.
- **Undo/redo, presentation mode, image cropping.** Polish with no
  leverage on the core loop (draft, revise, export). The inline editor
  plus chat history covers most recovery cases.
