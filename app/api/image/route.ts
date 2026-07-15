import { NextResponse } from "next/server";
import { getClient, imageModel, responseImage } from "@/lib/gemini";
import { buildImagePrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

type ImageRequest = { imageIdea: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ImageRequest;
    if (!body.imageIdea || !body.imageIdea.trim()) {
      return NextResponse.json(
        { error: "No imageIdea provided." },
        { status: 400 }
      );
    }

    const prompt = buildImagePrompt(body.imageIdea);

    const client = getClient();
    const result = await client.models.generateContent({
      model: imageModel(),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const image = responseImage(result);
    if (!image) {
      return NextResponse.json(
        { error: "No image returned by model." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageData: `data:${image.mimeType};base64,${image.data}`,
      mimeType: image.mimeType,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
