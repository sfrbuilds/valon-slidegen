import { describe, expect, it } from "vitest";
import {
  detectsChartIntent,
  detectsChartRemoval,
  detectsImageRemoval,
} from "../chart-intent";

describe("detectsChartIntent", () => {
  it("detects explicit chart asks", () => {
    expect(detectsChartIntent("add a chart of quarterly AUM")).toBe(true);
    expect(detectsChartIntent("show this as a bar chart")).toBe(true);
    expect(detectsChartIntent("give me a line graph of revenue")).toBe(true);
    expect(detectsChartIntent("plot the trend")).toBe(true);
    expect(detectsChartIntent("add a data visualization")).toBe(true);
    expect(detectsChartIntent("histogram of loan sizes")).toBe(true);
  });

  it("detects metric-cadence acronyms", () => {
    expect(detectsChartIntent("show AUM growth QoQ")).toBe(true);
    expect(detectsChartIntent("revenue quarter-over-quarter")).toBe(true);
    expect(detectsChartIntent("MoM active users")).toBe(true);
    expect(detectsChartIntent("40% YoY growth trend line")).toBe(true);
  });

  it("does NOT trigger on 'paragraph' (the /graph/ false positive)", () => {
    expect(detectsChartIntent("tighten this paragraph")).toBe(false);
    expect(detectsChartIntent("shorten the second paragraph")).toBe(false);
    expect(detectsChartIntent("make this photographic")).toBe(false);
  });

  it("does NOT trigger on 'bar' or 'mom' in ordinary language", () => {
    expect(detectsChartIntent("raise the bar on this slide")).toBe(false);
    expect(detectsChartIntent("this deck is for my mom")).toBe(false);
    expect(detectsChartIntent("mention the bar association")).toBe(false);
  });

  it("does NOT trigger on unrelated edits", () => {
    expect(detectsChartIntent("make this shorter")).toBe(false);
    expect(detectsChartIntent("add a number to the second bullet")).toBe(false);
    expect(detectsChartIntent("punchier heading please")).toBe(false);
  });
});

describe("removal intent", () => {
  it("detects chart removal", () => {
    expect(detectsChartRemoval("remove the chart")).toBe(true);
    expect(detectsChartRemoval("get rid of that graph")).toBe(true);
    expect(detectsChartRemoval("drop the visualization")).toBe(true);
  });

  it("detects image removal", () => {
    expect(detectsImageRemoval("remove the image")).toBe(true);
    expect(detectsImageRemoval("delete the illustration")).toBe(true);
  });

  it("removal is not confused with addition", () => {
    expect(detectsChartRemoval("add a chart")).toBe(false);
    expect(detectsImageRemoval("generate an image of a sunrise")).toBe(false);
  });

  it("a removal ask that mentions charts still reads as chart intent (routes must exclude removal before forcing)", () => {
    // Guards the route-level rule: forceChart = intent && !removal
    expect(detectsChartIntent("remove the chart")).toBe(true);
    expect(detectsChartRemoval("remove the chart")).toBe(true);
  });
});
