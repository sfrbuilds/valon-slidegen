import { NextResponse } from "next/server";
import { getClient, textModel, responseText } from "@/lib/gemini";
import { buildDraftPrompt } from "@/lib/prompts";
import { parseCustomTemplate, parseDeckDraft, toSlide } from "@/lib/deck-schema";
import { detectsChartIntent, CHART_MISS_WARNING } from "@/lib/chart-intent";
import { enforceChartGrounding } from "@/lib/chart-grounding";
import { GEMINI_DRAFT_RESPONSE_SCHEMA } from "@/lib/response-schemas";
import type { DraftDeckRequest, DraftDeckResponse } from "@/lib/types";

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
      responseSchema: GEMINI_DRAFT_RESPONSE_SCHEMA,
    },
  });
  return responseText(result);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DraftDeckRequest;
    const chartRequested = detectsChartIntent(body.brief);

    // Custom templates arrive as full objects (localStorage is invisible
    // to the server) and are validated like everything else untrusted.
    // 400, not 502: this is bad client input, not unusable model output.
    let customTemplate = null;
    if (body.customTemplate != null) {
      const tpl = parseCustomTemplate(body.customTemplate);
      if (!tpl.ok) {
        return NextResponse.json({ error: tpl.error }, { status: 400 });
      }
      customTemplate = tpl.value;
    }

    const promptInput = {
      brief: body.brief,
      team: body.team,
      audience: body.audience,
      targetLength: body.targetLength ?? null,
      contextDocs: Array.isArray(body.contextDocs) ? body.contextDocs : [],
      templateId: body.templateId ?? null,
      customTemplate,
    };

    let text = await generate(
      buildDraftPrompt({ ...promptInput, forceChart: chartRequested })
    );
    let parsed = parseDeckDraft(text);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error, raw: text.slice(0, 400) },
        { status: 502 }
      );
    }

    // Chart asked for but missing: retry ONCE, then degrade to a warning.
    // A complete, otherwise-valid deck is never discarded over one chart.
    let warning: string | undefined;
    if (chartRequested && !parsed.value.slides.some((s) => s.chartData)) {
      text = await generate(buildDraftPrompt({ ...promptInput, forceChart: true }));
      const retried = parseDeckDraft(text);
      if (retried.ok && retried.value.slides.some((s) => s.chartData)) {
        parsed = retried;
      } else {
        warning = CHART_MISS_WARNING;
      }
    }

    // The model's isDummyData claim is a hint; verify every plotted
    // value against the text the user actually provided.
    const grounded = enforceChartGrounding(
      parsed.value.slides,
      [body.brief, ...promptInput.contextDocs.map((d) => d.text)].join("\n")
    );

    const response: DraftDeckResponse = {
      deckTitle: parsed.value.deckTitle,
      slides: grounded.map(toSlide),
      ...(warning ? { warning } : {}),
    };
    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
