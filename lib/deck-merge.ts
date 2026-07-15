/**
 * Merge a model-revised deck back onto the existing deck.
 *
 * Identity is carried by `sourceSlideId`: the deck-redraft prompt sends
 * each slide's id and the response schema requires the model to echo it
 * (null for brand-new slides). Merging by id survives inserted, removed,
 * and reordered slides, which positional merging does not.
 *
 * Defenses:
 * - A sourceSlideId that doesn't match any existing slide is treated as
 *   a new slide (the model may not invent ids).
 * - A duplicated sourceSlideId only binds its first occurrence; later
 *   occurrences become new slides.
 * - If the model echoed no ids at all (schema miss), fall back to
 *   positional merging rather than dropping all identity.
 */

import type { DraftedSlide } from "./deck-schema";
import { makeId, type Slide } from "./types";

export type MergeOptions = {
  // When the user asked to remove a chart/image, the model's omission is
  // honored as a deliberate clear instead of falling back to the prior
  // visual.
  chartRemoval: boolean;
  imageRemoval: boolean;
};

function mergeOne(
  old: Slide | undefined,
  next: DraftedSlide,
  opts: MergeOptions
): Slide {
  if (!old) {
    return {
      id: makeId("slide"),
      layout: next.layout,
      heading: next.heading,
      subheading: next.subheading,
      bullets: next.bullets,
      imageIdea: next.imageIdea,
      chartData: next.chartData,
    };
  }
  const chartData = opts.chartRemoval
    ? next.chartData
    : next.chartData ?? old.chartData;
  const imageIdea = opts.imageRemoval
    ? next.imageIdea
    : next.imageIdea ?? old.imageIdea;
  // Keep the generated image only if the idea is unchanged and no chart
  // took the visual slot.
  const imageData =
    !opts.imageRemoval && imageIdea === old.imageIdea && !chartData
      ? old.imageData
      : undefined;
  return {
    ...old,
    layout: next.layout,
    heading: next.heading,
    subheading: next.subheading,
    bullets: next.bullets,
    imageIdea,
    imageData,
    chartData,
  };
}

export function mergeDeckSlides(
  prior: Slide[],
  drafted: DraftedSlide[],
  opts: MergeOptions
): Slide[] {
  const byId = new Map(prior.map((s) => [s.id, s]));
  const anyIdsEchoed = drafted.some(
    (d) => d.sourceSlideId && byId.has(d.sourceSlideId)
  );

  if (!anyIdsEchoed) {
    // Schema miss: no usable ids came back. Positional fallback.
    return drafted.map((next, i) => mergeOne(prior[i], next, opts));
  }

  const used = new Set<string>();
  return drafted.map((next) => {
    const id = next.sourceSlideId;
    const old =
      id && byId.has(id) && !used.has(id) ? byId.get(id) : undefined;
    if (old) used.add(old.id);
    return mergeOne(old, next, opts);
  });
}
