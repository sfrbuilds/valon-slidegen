import { NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { mapDeck, slugify } from "@/lib/pptx-map";
import type { Deck } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Export a Deck to PPTX. Structured slide model: text goes into
 * pptxgenjs text placeholders, images (if present) go into image
 * placeholders as separate layers. Prompts, briefs, and context docs
 * never touch this route: only the Deck itself.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { deck: Deck };
    if (!body.deck || !body.deck.title || !Array.isArray(body.deck.slides)) {
      return NextResponse.json({ error: "Invalid deck payload." }, { status: 400 });
    }

    const mapped = mapDeck(body.deck);
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = mapped.title;

    for (const spec of mapped.slides) {
      const slide = pptx.addSlide();
      slide.background = { color: spec.background };

      for (const t of spec.texts) {
        slide.addText(t.text, {
          x: t.x,
          y: t.y,
          w: t.w,
          h: t.h,
          fontFace: t.fontFace,
          fontSize: t.fontSize,
          color: t.color,
          italic: t.italic,
          bold: t.bold,
          align: t.align,
          bullet: "bullet" in t && t.bullet ? { indent: 15 } : false,
          valign: "top",
        });
      }

      if ("image" in spec && spec.image) {
        // pptxgenjs accepts data: URIs directly. "cover" sizing crops to
        // fill the frame instead of stretching the image into it.
        slide.addImage({
          data: spec.image.data,
          x: spec.image.x,
          y: spec.image.y,
          w: spec.image.w,
          h: spec.image.h,
          sizing: {
            type: "cover",
            w: spec.image.w,
            h: spec.image.h,
          },
        });
      }

      if ("chart" in spec && spec.chart) {
        const cd = spec.chart.data;
        // pptxgenjs chart series shape
        const chartSeries = cd.series.map((s) => ({
          name: s.name,
          labels: cd.labels,
          values: s.values,
        }));
        const chartType =
          cd.type === "line" ? pptx.ChartType.line : pptx.ChartType.bar;
        slide.addChart(chartType, chartSeries, {
          x: spec.chart.x,
          y: spec.chart.y,
          w: spec.chart.w,
          h: spec.chart.h,
          barDir: cd.type === "bar" ? "col" : undefined,
          showTitle: false,
          showLegend: cd.series.length > 1,
          legendPos: "b",
          catAxisLabelFontFace: "Aptos",
          catAxisLabelFontSize: 10,
          catAxisLabelColor: "5A5148",
          valAxisLabelFontFace: "Aptos",
          valAxisLabelFontSize: 10,
          valAxisLabelColor: "5A5148",
          chartColors: ["141210", "D89A4E", "5A5148", "B8722E"],
          catGridLine: { style: "none" },
          valGridLine: { style: "solid", color: "E5E1DA", size: 0.5 },
          // Value labels on top of each bar / above each line point
          showValue: true,
          dataLabelPosition: cd.type === "bar" ? "outEnd" : "t",
          dataLabelColor: "141210",
          dataLabelFontFace: "Aptos",
          dataLabelFontSize: 9,
          dataLabelFontBold: true,
          // Y-axis unit label, mirroring the on-screen chart
          ...(cd.yAxisLabel
            ? {
                showValAxisTitle: true,
                valAxisTitle: cd.yAxisLabel,
                valAxisTitleFontFace: "Aptos",
                valAxisTitleFontSize: 10,
                valAxisTitleColor: "5A5148",
              }
            : {}),
        });
        if (spec.chart.caption) {
          slide.addText(spec.chart.caption.text, {
            x: spec.chart.caption.x,
            y: spec.chart.caption.y,
            w: spec.chart.caption.w,
            h: spec.chart.caption.h,
            fontFace: "Aptos",
            fontSize: 9,
            italic: false,
            color: spec.chart.caption.color,
            align: "left",
            valign: "middle",
          });
        }
        if (spec.chart.dummyChip) {
          slide.addText(spec.chart.dummyChip.text, {
            x: spec.chart.dummyChip.x,
            y: spec.chart.dummyChip.y,
            w: spec.chart.dummyChip.w,
            h: spec.chart.dummyChip.h,
            fontFace: "Aptos",
            fontSize: 9,
            bold: true,
            color: spec.chart.dummyChip.color,
            fill: { color: spec.chart.dummyChip.fill },
            align: "center",
            valign: "middle",
          });
        }
      }

      // Gold delineation dash directly under the heading (content slides only)
      if ("headingAccent" in spec && spec.headingAccent) {
        slide.addShape("rect", {
          x: spec.headingAccent.x,
          y: spec.headingAccent.y,
          w: spec.headingAccent.w,
          h: spec.headingAccent.h,
          fill: { color: spec.headingAccent.fill },
          line: { color: spec.headingAccent.fill, width: 0 },
        });
      }

      // Valon watermark bottom-right (content slides only)
      if ("watermark" in spec && spec.watermark) {
        slide.addText(spec.watermark.text, {
          x: spec.watermark.x,
          y: spec.watermark.y,
          w: spec.watermark.w,
          h: spec.watermark.h,
          fontFace: spec.watermark.fontFace,
          fontSize: spec.watermark.fontSize,
          italic: spec.watermark.italic,
          color: spec.watermark.color,
          align: spec.watermark.align,
          valign: "middle",
        });
      }

      // Thin accent bar (Valon wordmark gold) at slide bottom
      slide.addShape("rect", {
        x: spec.accentBar.x,
        y: spec.accentBar.y,
        w: spec.accentBar.w,
        h: spec.accentBar.h,
        fill: { color: spec.accentBar.fill },
        line: { color: spec.accentBar.fill, width: 0 },
      });
    }

    const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    const filename = `${slugify(mapped.title)}.pptx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
