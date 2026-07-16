import { NextResponse } from "next/server";
import { getClient, textModel, responseText } from "@/lib/gemini";
import { buildRedraftPrompt } from "@/lib/prompts";
import { parseSlideRedraft } from "@/lib/deck-schema";
import { enforceChartGrounding, trustedChartNumbers } from "@/lib/chart-grounding";
import {
  detectsChartIntent,
  detectsChartRemoval,
  detectsImageRemoval,
  CHART_MISS_WARNING,
} from "@/lib/chart-intent";
import { GEMINI_REDRAFT_RESPONSE_SCHEMA } from "@/lib/response-schemas";
import type { RedraftSlideRequest, RedraftSlideResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function generate(prompt: string) {
  const client = getClient();
  const result = await client.models.generateContent({
    model: textModel(),
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.7,
      responseMimeType: "application/json",
      responseSchema: GEMINI_REDRAFT_RESPONSE_SCHEMA,
    },
  });
  return responseText(result);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RedraftSlideRequest;
    const chartRequested = detectsChartIntent(body.instruction);
    const chartRemoval = detectsChartRemoval(body.instruction);
    const imageRemoval = detectsImageRemoval(body.instruction);

    // A removal ask is never a chart-add ask, even if it mentions "chart".
    const forceChart = chartRequested && !chartRemoval;

    const promptInput = {
      deck: {
        title: body.deck.title,
        brief: body.deck.brief,
        team: body.deck.team,
        audience: body.deck.audience,
        contextDoc: body.deck.contextDoc,
      },
      slide: body.slide,
      slideNumber: body.slideNumber,
      totalSlides: body.totalSlides,
      instruction: body.instruction,
      neighborHeadings: body.neighborHeadings,
      chatHistory: body.chatHistory,
    };

    let text = await generate(buildRedraftPrompt({ ...promptInput, forceChart }));
    let parsed = parseSlideRedraft(text);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error, raw: text.slice(0, 400) },
        { status: 502 }
      );
    }

    // Chart asked for but missing: retry ONCE (resample with the forcing
    // directive still in place). Never fail the request over it.
    let warning: string | undefined;
    if (forceChart && !parsed.value.slide.chartData) {
      text = await generate(buildRedraftPrompt({ ...promptInput, forceChart: true }));
      const retried = parseSlideRedraft(text);
      if (retried.ok && retried.value.slide.chartData) {
        parsed = retried;
      } else {
        warning = CHART_MISS_WARNING;
      }
    }

    // The model's isDummyData claim is a hint; verify plotted values
    // against user-provided text only (brief, reference doc, chat
    // instructions). Assistant messages are excluded so model-invented
    // numbers cannot ground themselves on a later turn.
    const sourceText = [
      body.deck.brief,
      body.deck.contextDoc?.text ?? "",
      body.instruction,
      ...body.chatHistory.filter((m) => m.role === "user").map((m) => m.content),
    ].join("\n");
    const [groundedSlide] = enforceChartGrounding(
      [parsed.value.slide],
      sourceText,
      trustedChartNumbers([body.slide])
    );

    // Merge semantics:
    // - Default: preserve an existing visual the model omitted (models are
    //   lazy about echoing unchanged fields).
    // - Removal intent: honor the omission as a deliberate clear.
    // - One-visual rule: a newly added chart clears the image, and vice versa.
    const prior = body.slide;
    const next = groundedSlide;
    let chartData = chartRemoval ? next.chartData : next.chartData ?? prior.chartData;
    let imageIdea = imageRemoval ? next.imageIdea : next.imageIdea ?? prior.imageIdea;
    let imageData = imageRemoval ? undefined : prior.imageData;

    const chartAdded = Boolean(next.chartData) && !prior.chartData;
    const imageAdded = Boolean(next.imageIdea) && !prior.imageIdea;
    if (chartAdded) {
      imageIdea = undefined;
      imageData = undefined;
    } else if (imageAdded) {
      chartData = undefined;
      imageData = undefined; // stale render for a new idea
    }
    if (imageIdea && imageIdea !== prior.imageIdea) {
      imageData = undefined; // prompt changed; stored render is stale
    }

    const response: RedraftSlideResponse = {
      slide: {
        ...prior,
        layout: next.layout,
        heading: next.heading,
        subheading: next.subheading,
        bullets: next.bullets,
        imageIdea,
        imageData,
        chartData,
      },
      editSummary: parsed.value.editSummary,
      ...(warning ? { warning } : {}),
    };
    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
