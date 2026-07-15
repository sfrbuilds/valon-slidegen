import { NextResponse } from "next/server";
import { getClient, textModel, responseText } from "@/lib/gemini";
import { buildEvalPrompt } from "@/lib/prompts";
import { parseEvalResult } from "@/lib/deck-schema";
import { GEMINI_EVAL_RESPONSE_SCHEMA } from "@/lib/response-schemas";
import { makeId, nowIso, type EvalRequest, type EvalResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Brand check: judge a drafted deck against the deck's tone rules.
 * On-demand only (a button in the workspace), so it adds zero latency
 * to drafting and revision. Findings quote the offending copy and are
 * tied to slide numbers so the user can jump straight to the slide.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EvalRequest;
    if (!body.deck || !Array.isArray(body.slides) || body.slides.length === 0) {
      return NextResponse.json({ error: "Invalid eval payload." }, { status: 400 });
    }

    const prompt = buildEvalPrompt({
      deck: {
        title: body.deck.title,
        team: body.deck.team,
        audience: body.deck.audience,
        brief: body.deck.brief,
        contextDoc: body.deck.contextDoc,
      },
      slides: body.slides,
    });

    const client = getClient();
    const result = await client.models.generateContent({
      model: textModel(),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        // Low temperature: the reviewer should be consistent, not creative.
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: GEMINI_EVAL_RESPONSE_SCHEMA,
      },
    });

    const text = responseText(result);
    const parsed = parseEvalResult(text);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error, raw: text.slice(0, 400) },
        { status: 502 }
      );
    }

    const response: EvalResponse = {
      evalRun: {
        id: makeId("eval"),
        deckId: body.deck.id,
        deckTitle: body.deck.title,
        contextFilename: body.deck.contextDoc?.filename ?? null,
        trigger: body.trigger,
        verdict: parsed.value.verdict,
        findings: parsed.value.findings,
        timestamp: nowIso(),
      },
    };
    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
