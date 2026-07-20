import { NextResponse } from "next/server";
import { getClient, textModel, responseText } from "@/lib/gemini";
import { buildDeckRedraftPrompt } from "@/lib/prompts";
import { parseDeckRedraft } from "@/lib/deck-validation";
import { enforceChartGrounding, trustedChartNumbers } from "@/lib/chart-grounding";
import { mergeDeckSlides } from "@/lib/deck-merge";
import {
  detectsChartIntent,
  detectsChartRemoval,
  detectsImageRemoval,
  CHART_MISS_WARNING,
} from "@/lib/chart-intent";
import { GEMINI_DECK_REDRAFT_RESPONSE_SCHEMA } from "@/lib/model-response-schemas";
import type { RedraftDeckRequest, RedraftDeckResponse } from "@/lib/types";

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
      responseSchema: GEMINI_DECK_REDRAFT_RESPONSE_SCHEMA,
    },
  });
  return responseText(result);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RedraftDeckRequest;
    const chartRequested = detectsChartIntent(body.instruction);
    const chartRemoval = detectsChartRemoval(body.instruction);
    const imageRemoval = detectsImageRemoval(body.instruction);
    const forceChart = chartRequested && !chartRemoval;

    const promptInput = {
      deck: {
        title: body.deck.title,
        brief: body.deck.brief,
        team: body.deck.team,
        audience: body.deck.audience,
        contextDocs: Array.isArray(body.deck.contextDocs)
          ? body.deck.contextDocs
          : [],
      },
      slides: body.slides,
      instruction: body.instruction,
      chatHistory: body.chatHistory,
    };

    let text = await generate(
      buildDeckRedraftPrompt({ ...promptInput, forceChart })
    );
    let parsed = parseDeckRedraft(text);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error, raw: text.slice(0, 400) },
        { status: 502 }
      );
    }

    let warning: string | undefined;
    if (forceChart && !parsed.value.slides.some((s) => s.chartData)) {
      text = await generate(
        buildDeckRedraftPrompt({ ...promptInput, forceChart: true })
      );
      const retried = parseDeckRedraft(text);
      if (retried.ok && retried.value.slides.some((s) => s.chartData)) {
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
      ...promptInput.deck.contextDocs.map((d) => d.text),
      body.instruction,
      ...body.chatHistory.filter((m) => m.role === "user").map((m) => m.content),
    ].join("\n");
    const groundedSlides = enforceChartGrounding(
      parsed.value.slides,
      sourceText,
      trustedChartNumbers(body.slides)
    );

    // Identity-aware merge: slides are matched by the sourceSlideId the
    // model echoes back (see lib/deck-merge.ts for the fallbacks).
    const response: RedraftDeckResponse = {
      slides: mergeDeckSlides(body.slides, groundedSlides, {
        chartRemoval,
        imageRemoval,
      }),
      editSummary: parsed.value.editSummary,
      ...(warning ? { warning } : {}),
    };
    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
