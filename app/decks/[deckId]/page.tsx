"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { Sunburst } from "@/components/brand/Sunburst";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Chip } from "@/components/ui/Chip";
import { StagedProgress } from "@/components/ui/StagedProgress";
import { useStore } from "@/lib/store";
import { slugify } from "@/lib/pptx-map";
import {
  makeId,
  nowIso,
  TEAM_LABELS,
  AUDIENCE_LABELS,
  type ChatMessage,
  type ChatScope,
  type ChartData,
  type Deck,
  type EvalRequest,
  type EvalResponse,
  type EvalRun,
  type RedraftDeckRequest,
  type RedraftDeckResponse,
  type RedraftSlideRequest,
  type RedraftSlideResponse,
  type Slide,
} from "@/lib/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function WorkspacePage() {
  const params = useParams<{ deckId: string }>();
  const router = useRouter();
  const { getDeck, updateDeck, updateSlide, addChatMessage, removeChatMessage } = useStore();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [chatScope, setChatScope] = useState<ChatScope>("slide");
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState<"idle" | "redraft" | "image" | "export" | "eval" | "fix">("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [evalRun, setEvalRun] = useState<EvalRun | null>(null);
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<{ index: number; position: "above" | "below" } | null>(null);

  useEffect(() => {
    const d = getDeck(params.deckId);
    if (!d) {
      router.replace("/");
      return;
    }
    setDeck(d);
    setSelectedSlideId(d.slides[0]?.id ?? null);
  }, [params.deckId, getDeck, router]);

  const selectedSlide = useMemo(
    () => deck?.slides.find((s) => s.id === selectedSlideId) ?? null,
    [deck, selectedSlideId]
  );

  const visibleMessages = useMemo(() => {
    if (!deck) return [];
    return deck.chatHistory.filter(
      (m) =>
        m.scope === "deck" ||
        (m.scope === "slide" && m.slideId === selectedSlideId)
    );
  }, [deck, selectedSlideId]);

  async function handleRedraft() {
    if (!deck || !selectedSlide || !chatInput.trim()) return;
    setBusy("redraft");
    setError(null);
    setWarning(null);
    const instruction = chatInput.trim();

    const userMsg: ChatMessage = {
      id: makeId("msg"),
      role: "user",
      content: instruction,
      timestamp: nowIso(),
      scope: chatScope,
      slideId: chatScope === "slide" ? selectedSlide.id : undefined,
    };
    // Optimistically append the user message before the network call so
    // the chat feels responsive. Rolled back on failure.
    addChatMessage(deck.id, userMsg);
    setChatInput("");

    try {
      let editSummary: string;
      let responseWarning: string | undefined;

      if (chatScope === "deck") {
        // Whole-deck revision: one call, full deck in, full deck out.
        const payload: RedraftDeckRequest = {
          deck: {
            id: deck.id,
            title: deck.title,
            team: deck.team,
            audience: deck.audience,
            brief: deck.brief,
            contextDoc: deck.contextDoc,
          },
          slides: deck.slides,
          instruction,
          chatHistory: [...deck.chatHistory, userMsg],
        };
        const res = await fetch("/api/redraft-deck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Deck revision failed (${res.status})`);
        }
        const data = (await res.json()) as RedraftDeckResponse;
        // Atomic: the optimistic chat message is already persisted, so
        // writing a stale `deck` closure here would erase it.
        updateDeck(deck.id, (d) => ({ ...d, slides: data.slides }));
        editSummary = data.editSummary;
        responseWarning = data.warning;
        // Keep the selection stable if the slide survived the revision.
        if (!data.slides.some((s) => s.id === selectedSlideId)) {
          setSelectedSlideId(data.slides[0]?.id ?? null);
        }
      } else {
        const idx = deck.slides.findIndex((s) => s.id === selectedSlide.id);
        const neighborHeadings = [
          deck.slides[idx - 1]?.heading,
          deck.slides[idx + 1]?.heading,
        ].filter((h): h is string => Boolean(h));
        const payload: RedraftSlideRequest = {
          deck: {
            id: deck.id,
            title: deck.title,
            team: deck.team,
            audience: deck.audience,
            brief: deck.brief,
            contextDoc: deck.contextDoc,
          },
          slide: selectedSlide,
          slideNumber: idx + 1,
          totalSlides: deck.slides.length,
          instruction,
          neighborHeadings,
          chatHistory: [...deck.chatHistory, userMsg],
        };
        const res = await fetch("/api/redraft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Redraft failed (${res.status})`);
        }
        const data = (await res.json()) as RedraftSlideResponse;
        updateSlide(deck.id, data.slide);
        editSummary = data.editSummary;
        responseWarning = data.warning;
      }

      const assistantMsg: ChatMessage = {
        id: makeId("msg"),
        role: "assistant",
        content: editSummary,
        timestamp: nowIso(),
        scope: chatScope,
        slideId: chatScope === "slide" ? selectedSlide.id : undefined,
        editSummary,
      };
      addChatMessage(deck.id, assistantMsg);
      if (responseWarning) setWarning(responseWarning);
      // Re-hydrate local deck from store
      const refreshed = getDeck(deck.id);
      if (refreshed) setDeck(refreshed);
    } catch (e) {
      setError((e as Error).message);
      // Roll back: the instruction was not applied, so it should not sit
      // in history looking like it was. Give the user their text back.
      removeChatMessage(deck.id, userMsg.id);
      setChatInput(instruction);
      const refreshed = getDeck(deck.id);
      if (refreshed) setDeck(refreshed);
    } finally {
      setBusy("idle");
    }
  }

  /**
   * One bounded fix pass: findings become a minimal-edit instruction for
   * the deck-redraft route, the edit lands in chat history like any other
   * revision, then the brand check re-runs once so the verdict updates.
   * Deliberately not iterate-until-green: the author stays the editor.
   */
  async function handleFixFindings() {
    if (!deck || !evalRun || evalRun.findings.length === 0) return;
    setBusy("fix");
    setError(null);
    const findingLines = evalRun.findings.map((f) =>
      f.slideNumber !== null
        ? `Slide ${f.slideNumber}: ${f.issue}`
        : `Deck-level: ${f.issue}`
    );
    const instruction = [
      "A brand check flagged the following tone violations. Fix each one with the smallest edit that resolves it. Do not rewrite anything that was not flagged.",
      ...findingLines.map((l) => `- ${l}`),
    ].join("\n");

    const userMsg: ChatMessage = {
      id: makeId("msg"),
      role: "user",
      content: `Fix ${evalRun.findings.length} brand check finding${evalRun.findings.length === 1 ? "" : "s"}`,
      timestamp: nowIso(),
      scope: "deck",
    };
    addChatMessage(deck.id, userMsg);

    try {
      const payload: RedraftDeckRequest = {
        deck: {
          id: deck.id,
          title: deck.title,
          team: deck.team,
          audience: deck.audience,
          brief: deck.brief,
          contextDoc: deck.contextDoc,
        },
        slides: deck.slides,
        instruction,
        chatHistory: [...deck.chatHistory, userMsg],
      };
      const res = await fetch("/api/redraft-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Fix pass failed (${res.status})`);
      }
      const data = (await res.json()) as RedraftDeckResponse;
      // Atomic: preserves the optimistic chat message persisted above.
      updateDeck(deck.id, (d) => ({ ...d, slides: data.slides }));
      addChatMessage(deck.id, {
        id: makeId("msg"),
        role: "assistant",
        content: data.editSummary,
        timestamp: nowIso(),
        scope: "deck",
        editSummary: data.editSummary,
      });
      if (!data.slides.some((s) => s.id === selectedSlideId)) {
        setSelectedSlideId(data.slides[0]?.id ?? null);
      }
      const refreshed = getDeck(deck.id);
      if (refreshed) setDeck(refreshed);

      // Re-check once so the verdict reflects the fixed deck.
      const evalPayload: EvalRequest = {
        deck: {
          id: deck.id,
          title: deck.title,
          team: deck.team,
          audience: deck.audience,
          brief: deck.brief,
          contextDoc: deck.contextDoc,
        },
        slides: data.slides,
        trigger: "redraft",
      };
      const evalRes = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evalPayload),
      });
      if (evalRes.ok) {
        const evalData = (await evalRes.json()) as EvalResponse;
        setEvalRun(evalData.evalRun);
      } else {
        // Fixes landed; only the re-check failed. Keep the deck, say so.
        setEvalRun(null);
        setWarning(
          "Fixes were applied, but the re-check failed. Run Brand check again to verify."
        );
      }
    } catch (e) {
      setError((e as Error).message);
      removeChatMessage(deck.id, userMsg.id);
      const refreshed = getDeck(deck.id);
      if (refreshed) setDeck(refreshed);
    } finally {
      setBusy("idle");
    }
  }

  async function handleBrandCheck() {
    if (!deck) return;
    setBusy("eval");
    setError(null);
    try {
      const payload: EvalRequest = {
        deck: {
          id: deck.id,
          title: deck.title,
          team: deck.team,
          audience: deck.audience,
          brief: deck.brief,
          contextDoc: deck.contextDoc,
        },
        slides: deck.slides,
        trigger: "redraft",
      };
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Brand check failed (${res.status})`);
      }
      const data = (await res.json()) as EvalResponse;
      setEvalRun(data.evalRun);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("idle");
    }
  }

  async function handleImage() {
    if (!deck || !selectedSlide?.imageIdea) return;
    setBusy("image");
    setError(null);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIdea: selectedSlide.imageIdea }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Image failed (${res.status})`);
      }
      const data = (await res.json()) as { imageData: string };
      const nextSlide: Slide = { ...selectedSlide, imageData: data.imageData };
      const saved = updateSlide(deck.id, nextSlide);
      if (!saved) {
        // Base64 images are the one payload that can blow the localStorage
        // quota. The image still renders from state; warn that it won't
        // survive a reload.
        setWarning(
          "The image was generated but could not be saved locally (browser storage is full). It will disappear on reload. Export the deck now, or remove images from other slides."
        );
        setDeck({ ...deck, slides: deck.slides.map((s) => (s.id === nextSlide.id ? nextSlide : s)) });
      } else {
        const refreshed = getDeck(deck.id);
        if (refreshed) setDeck(refreshed);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("idle");
    }
  }

  async function handleExport(alsoOpenSlides: boolean = false) {
    if (!deck) return;
    setBusy("export");
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Slugified: raw titles can contain characters that break downloads.
      a.download = `${slugify(deck.title)}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (alsoOpenSlides) {
        // No Google API access here; open Slides so the user drops the
        // downloaded file into "File > Open > Upload". This is the standard
        // interop path without an OAuth flow.
        window.open("https://slides.google.com/", "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("idle");
    }
  }

  function handleTitleEdit(newTitle: string) {
    if (!deck) return;
    updateDeck(deck.id, (d) => ({ ...d, title: newTitle }));
    const refreshed = getDeck(deck.id);
    if (refreshed) setDeck(refreshed);
  }

  function handleAddSlide() {
    if (!deck) return;
    const newSlide: Slide = {
      id: makeId("slide"),
      layout: "content",
      heading: "New slide",
      bullets: ["First point"],
    };
    updateDeck(deck.id, (d) => ({ ...d, slides: [...d.slides, newSlide] }));
    const refreshed = getDeck(deck.id);
    if (refreshed) setDeck(refreshed);
    setSelectedSlideId(newSlide.id);
  }

  function handleDeleteSlide(slideId: string) {
    if (!deck) return;
    if (deck.slides.length <= 1) {
      setError("Can't delete the last slide.");
      return;
    }
    const idx = deck.slides.findIndex((s) => s.id === slideId);
    updateDeck(deck.id, (d) => ({
      ...d,
      slides: d.slides.filter((s) => s.id !== slideId),
    }));
    const refreshed = getDeck(deck.id);
    if (refreshed) setDeck(refreshed);
    // Reselect a neighbor
    if (refreshed && selectedSlideId === slideId) {
      const neighbor =
        refreshed.slides[idx] ?? refreshed.slides[idx - 1] ?? refreshed.slides[0];
      setSelectedSlideId(neighbor?.id ?? null);
    }
  }

  function handleReorderSlide(sourceIndex: number, targetIndex: number) {
    if (!deck) return;
    if (sourceIndex === targetIndex) return;
    updateDeck(deck.id, (d) => {
      const nextSlides = [...d.slides];
      const [moved] = nextSlides.splice(sourceIndex, 1);
      // If dropping below the source's original position, the target index
      // already shifts down by one; account for that.
      const insertAt = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      nextSlides.splice(insertAt, 0, moved);
      return { ...d, slides: nextSlides };
    });
    const refreshed = getDeck(deck.id);
    if (refreshed) setDeck(refreshed);
  }

  if (!deck || !selectedSlide) {
    return (
      <div className="page">
        <p className="body-md">Loading...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr 380px",
        height: "100vh",
        background: "var(--paper-warm-1)",
      }}
    >
      {/* Slide rail */}
      <aside
        style={{
          borderRight: "1px solid var(--ink-100)",
          background: "var(--paper-white)",
          overflowY: "auto",
          padding: "16px 12px",
        }}
      >
        <div style={{ marginBottom: 16, padding: "0 4px" }}>
          <Link href="/">
            <Wordmark />
          </Link>
        </div>
        {deck.slides.map((slide, i) => (
          <SlideRailItem
            key={slide.id}
            slide={slide}
            index={i}
            selected={slide.id === selectedSlideId}
            canDelete={deck.slides.length > 1}
            isDragging={dragSourceIndex === i}
            dropIndicator={
              dragOver && dragOver.index === i ? dragOver.position : null
            }
            onSelect={() => setSelectedSlideId(slide.id)}
            onDelete={() => {
              if (confirm(`Delete slide ${i + 1}?`)) handleDeleteSlide(slide.id);
            }}
            onDragStart={() => setDragSourceIndex(i)}
            onDragEnd={() => {
              setDragSourceIndex(null);
              setDragOver(null);
            }}
            onDragOver={(position) => {
              if (dragSourceIndex === null) return;
              setDragOver({ index: i, position });
            }}
            onDrop={() => {
              if (dragSourceIndex === null) return;
              const targetIndex =
                dragOver?.position === "below" ? i + 1 : i;
              handleReorderSlide(dragSourceIndex, targetIndex);
              setDragSourceIndex(null);
              setDragOver(null);
            }}
          />
        ))}

        <button
          onClick={handleAddSlide}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            padding: "10px 12px",
            marginTop: 8,
            borderRadius: "var(--radius-sm)",
            border: "1px dashed var(--ink-300)",
            background: "transparent",
            color: "var(--ink-500)",
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New slide
        </button>
      </aside>

      {/* Slide canvas */}
      <main style={{ overflowY: "auto", padding: "24px 32px" }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
            padding: "6px 10px 6px 8px",
            marginLeft: -10,
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            color: "var(--ink-500)",
            textDecoration: "none",
            transition: "background 120ms ease, color 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--paper-warm-2)";
            e.currentTarget.style.color = "var(--ink-900)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--ink-500)";
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>←</span> Home
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 20,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {TEAM_LABELS[deck.team]} · {AUDIENCE_LABELS[deck.audience]}
            </div>
            <input
              value={deck.title}
              onChange={(e) => handleTitleEdit(e.target.value)}
              className="h-large"
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                outline: "none",
                padding: 0,
                textOverflow: "ellipsis",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Button
              variant="secondary"
              onClick={handleBrandCheck}
              disabled={busy !== "idle"}
              title="Reviews every slide against this deck's tone rules and flags off-brand copy."
            >
              {busy === "eval" ? "Checking..." : "Brand check"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleExport(true)}
              disabled={busy !== "idle"}
              title="Downloads the .pptx and opens Google Slides. Drop the file into File > Open > Upload."
            >
              Open in Google Slides
            </Button>
            <Button variant="primary" onClick={() => handleExport(false)} disabled={busy !== "idle"}>
              {busy === "export" ? "Exporting..." : "Export .pptx"}
            </Button>
          </div>
        </div>

        {evalRun && busy !== "fix" && (
          <EvalPanel
            evalRun={evalRun}
            slideCount={deck.slides.length}
            fixDisabled={busy !== "idle"}
            onFix={handleFixFindings}
            onJumpToSlide={(slideNumber) => {
              const target = deck.slides[slideNumber - 1];
              if (target) setSelectedSlideId(target.id);
            }}
            onDismiss={() => setEvalRun(null)}
          />
        )}

        {(busy === "eval" || busy === "fix") && (
          <div
            style={{
              marginBottom: 20,
              padding: "14px 20px",
              borderRadius: "var(--radius-md)",
              background: "var(--paper-white)",
              border: "1px solid var(--ink-100)",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>
              {busy === "fix" ? "Fixing findings" : "Brand check"}
            </div>
            <StagedProgress
              stages={
                busy === "fix"
                  ? [
                      "Applying the smallest edit for each finding",
                      "Rewriting flagged copy in tone",
                      "Re-running the brand check",
                    ]
                  : [
                      `Reading all ${deck.slides.length} slides`,
                      `Judging against the ${TEAM_LABELS[deck.team]} · ${AUDIENCE_LABELS[deck.audience]} tone rules`,
                      "Writing findings",
                    ]
              }
            />
          </div>
        )}

        {deck.brief && <BriefPanel brief={deck.brief} />}

        <div
          style={{
            opacity: busy === "redraft" || busy === "fix" ? 0.55 : 1,
            pointerEvents: busy === "redraft" || busy === "fix" ? "none" : "auto",
            transition: "opacity 200ms ease",
          }}
        >
          <SlideEditor
            slide={selectedSlide}
            onChange={(next) => {
              updateSlide(deck.id, next);
              const refreshed = getDeck(deck.id);
              if (refreshed) setDeck(refreshed);
            }}
          />
        </div>

        {selectedSlide.layout === "content" && (
          <VisualPanel
            slide={selectedSlide}
            busy={busy}
            onGenerateImage={handleImage}
            onSetImagePrompt={(prompt) => {
              updateSlide(deck.id, {
                ...selectedSlide,
                imageIdea: prompt,
                // Clear stale image if the prompt changed materially
                imageData: undefined,
                // Adding an image drops any existing chart, since side visual is one slot
                chartData: undefined,
              });
              const refreshed = getDeck(deck.id);
              if (refreshed) setDeck(refreshed);
            }}
            onRemoveImage={() => {
              updateSlide(deck.id, {
                ...selectedSlide,
                imageIdea: undefined,
                imageData: undefined,
              });
              const refreshed = getDeck(deck.id);
              if (refreshed) setDeck(refreshed);
            }}
            onSetChart={(chartData) => {
              updateSlide(deck.id, {
                ...selectedSlide,
                chartData,
                // Chart takes the side-visual slot; clear image
                imageIdea: undefined,
                imageData: undefined,
              });
              const refreshed = getDeck(deck.id);
              if (refreshed) setDeck(refreshed);
            }}
            onRemoveChart={() => {
              updateSlide(deck.id, { ...selectedSlide, chartData: undefined });
              const refreshed = getDeck(deck.id);
              if (refreshed) setDeck(refreshed);
            }}
          />
        )}
        {warning && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "rgba(216, 154, 78, 0.14)",
              border: "1px solid var(--accent-soft)",
              color: "var(--accent-deep)",
              fontSize: 14,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>{warning}</span>
            <button
              onClick={() => setWarning(null)}
              aria-label="Dismiss warning"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--accent-deep)",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        )}
        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "#F9E4E4",
              color: "var(--error)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}
      </main>

      {/* Chat panel */}
      <aside
        style={{
          borderLeft: "1px solid var(--ink-100)",
          background: "var(--paper-white)",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--ink-100)",
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Revise with chat
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Chip active={chatScope === "slide"} onClick={() => setChatScope("slide")}>
              This slide
            </Chip>
            <Chip active={chatScope === "deck"} onClick={() => setChatScope("deck")}>
              Whole deck
            </Chip>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {visibleMessages.length === 0 && busy !== "redraft" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-500)" }}>
              <Sunburst size={16} color="var(--accent)" />
              <span className="body-sm">
                Tell SlideGen what to change. Multi-turn context is preserved.
              </span>
            </div>
          ) : (
            visibleMessages.map((m) => (
              <div
                key={m.id}
                style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background:
                    m.role === "user" ? "var(--paper-warm-2)" : "var(--paper-warm-1)",
                  border: "1px solid var(--ink-100)",
                }}
              >
                <div
                  className="eyebrow"
                  style={{
                    marginBottom: 6,
                    fontSize: 10,
                    color: "var(--ink-500)",
                  }}
                >
                  {m.role === "user" ? "You" : "SlideGen"} · {m.scope === "deck" ? "deck" : "slide"}
                </div>
                <div className="body-md">{m.content}</div>
              </div>
            ))
          )}
          {busy === "redraft" && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--paper-warm-1)",
                border: "1px solid var(--ink-100)",
              }}
            >
              <div
                className="eyebrow"
                style={{ marginBottom: 8, fontSize: 10, color: "var(--ink-500)" }}
              >
                SlideGen · {chatScope === "deck" ? "deck" : "slide"}
              </div>
              <StagedProgress
                compact
                stages={
                  chatScope === "deck"
                    ? [
                        `Reading all ${deck.slides.length} slides`,
                        "Applying your instruction across the deck",
                        "Rewriting copy in tone",
                        "Keeping headings consistent",
                      ]
                    : [
                        "Reading the slide",
                        "Applying your instruction",
                        "Rewriting in tone",
                        "Tightening bullets",
                      ]
                }
              />
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--ink-100)" }}>
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends (standard chat UX); Shift+Enter inserts a newline.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleRedraft();
              }
            }}
            placeholder={
              chatScope === "slide"
                ? "Change this slide (Enter to send, Shift+Enter for newline)"
                : "Change the whole deck (Enter to send, Shift+Enter for newline)"
            }
            style={{ minHeight: 80, marginBottom: 8 }}
          />
          <Button
            variant="primary"
            onClick={handleRedraft}
            disabled={busy !== "idle" || !chatInput.trim()}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {busy === "redraft" ? "Revising..." : "Send"}
          </Button>
        </div>
      </aside>
    </div>
  );
}

/**
 * A single row in the slide rail. Shows the slide index, layout, and
 * heading. On hover, a small × delete affordance appears (Google Slides
 * style). The row itself remains clickable to select the slide.
 */
/**
 * Full-width brief panel that sits above the slide. Shows the original
 * user prompt in full, no truncation. Provides the context that shaped
 * the deck as the user iterates.
 */
function BriefPanel({ brief }: { brief: string }) {
  return (
    <div
      style={{
        marginBottom: 20,
        padding: "16px 20px",
        borderRadius: "var(--radius-md)",
        background: "var(--paper-warm-2)",
        border: "1px solid var(--ink-100)",
      }}
    >
      <div
        className="eyebrow"
        style={{
          marginBottom: 8,
          fontSize: 10,
          color: "var(--ink-500)",
        }}
      >
        Prompt
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 15,
          lineHeight: 1.55,
          color: "var(--ink-700)",
          whiteSpace: "pre-wrap",
        }}
      >
        {brief}
      </div>
    </div>
  );
}

/**
 * Brand-check results panel. Verdict chip plus findings; slide-level
 * findings are clickable and jump to the offending slide.
 */
function EvalPanel({
  evalRun,
  slideCount,
  fixDisabled,
  onFix,
  onJumpToSlide,
  onDismiss,
}: {
  evalRun: EvalRun;
  slideCount: number;
  fixDisabled: boolean;
  onFix: () => void;
  onJumpToSlide: (slideNumber: number) => void;
  onDismiss: () => void;
}) {
  const onBrand = evalRun.verdict === "on-brand";
  return (
    <div
      style={{
        marginBottom: 20,
        padding: "16px 20px",
        borderRadius: "var(--radius-md)",
        background: "var(--paper-white)",
        border: `1px solid ${onBrand ? "var(--accent-soft)" : "var(--ink-100)"}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: onBrand ? 0 : 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>
            Brand check
          </span>
          <span
            style={{
              padding: "3px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderRadius: 999,
              color: onBrand ? "var(--accent-deep)" : "var(--error)",
              background: onBrand ? "rgba(216, 154, 78, 0.14)" : "#F9E4E4",
              border: onBrand
                ? "1px solid var(--accent-soft)"
                : "1px solid rgba(0,0,0,0.06)",
            }}
          >
            {onBrand ? "On brand" : "Needs revision"}
          </span>
          {!onBrand && evalRun.findings.length > 0 && (
            <Button
              variant="secondary"
              onClick={onFix}
              disabled={fixDisabled}
              title="One bounded pass: applies the smallest edit per finding via deck revision, then re-runs the check."
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              Fix findings
            </Button>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss brand check"
          style={{
            border: "none",
            background: "transparent",
            color: "var(--ink-500)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      {!onBrand && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {evalRun.findings.map((f, i) => {
            const jumpable =
              f.slideNumber !== null &&
              f.slideNumber >= 1 &&
              f.slideNumber <= slideCount;
            return (
              <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                {jumpable ? (
                  <button
                    onClick={() => onJumpToSlide(f.slideNumber!)}
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--accent-deep)",
                      border: "1px solid var(--accent-soft)",
                      borderRadius: 4,
                      background: "transparent",
                      padding: "2px 6px",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    Slide {f.slideNumber}
                  </button>
                ) : (
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: "var(--ink-500)", flexShrink: 0 }}
                  >
                    Deck
                  </span>
                )}
                <span className="body-sm" style={{ color: "var(--ink-700)" }}>
                  {f.issue}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Below-slide toolbar for the side visual (image OR chart). Three states:
 * - none: two big "+ Add image" and "+ Add chart" buttons
 * - image: shows current prompt (editable), Regenerate, Remove
 * - chart: shows inline data editor (labels + values), type toggle, Remove
 * Only one visual can be attached at a time; adding one clears the other.
 */
function VisualPanel({
  slide,
  busy,
  onGenerateImage,
  onSetImagePrompt,
  onRemoveImage,
  onSetChart,
  onRemoveChart,
}: {
  slide: Slide;
  busy: "idle" | "redraft" | "image" | "export" | "eval" | "fix";
  onGenerateImage: () => void;
  onSetImagePrompt: (prompt: string) => void;
  onRemoveImage: () => void;
  onSetChart: (chartData: ChartData) => void;
  onRemoveChart: () => void;
}) {
  const hasChart = Boolean(slide.chartData);
  const hasImage = Boolean(slide.imageIdea) || Boolean(slide.imageData);

  return (
    <div
      style={{
        marginTop: 20,
        padding: 16,
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--ink-100)",
        background: "var(--paper-white)",
      }}
    >
      <div
        className="eyebrow"
        style={{ marginBottom: 12, fontSize: 10 }}
      >
        Visual
      </div>

      {!hasChart && !hasImage && (
        <VisualEmptyState
          onAddImage={() => onSetImagePrompt("editorial illustration of ")}
          onAddChart={() =>
            onSetChart({
              type: "bar",
              labels: ["Q1", "Q2", "Q3", "Q4"],
              series: [{ name: "Value", values: [10, 15, 22, 30] }],
              isDummyData: true,
            })
          }
        />
      )}

      {hasImage && (
        <ImageEditor
          slide={slide}
          busy={busy}
          onGenerate={onGenerateImage}
          onPromptChange={onSetImagePrompt}
          onRemove={onRemoveImage}
        />
      )}

      {hasChart && slide.chartData && (
        <ChartEditor
          chartData={slide.chartData}
          onChange={onSetChart}
          onRemove={onRemoveChart}
        />
      )}
    </div>
  );
}

function VisualEmptyState({
  onAddImage,
  onAddChart,
}: {
  onAddImage: () => void;
  onAddChart: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <button
        onClick={onAddImage}
        style={emptyButtonStyle}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
        <span>Add image</span>
        <span
          className="body-sm"
          style={{ color: "var(--ink-500)", marginLeft: "auto", fontSize: 11 }}
        >
          Editorial illustration via Gemini
        </span>
      </button>
      <button
        onClick={onAddChart}
        style={emptyButtonStyle}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
        <span>Add chart</span>
        <span
          className="body-sm"
          style={{ color: "var(--ink-500)", marginLeft: "auto", fontSize: 11 }}
        >
          Editable bar or line chart
        </span>
      </button>
    </div>
  );
}

const emptyButtonStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  border: "1px dashed var(--ink-300)",
  borderRadius: "var(--radius-md)",
  background: "transparent",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  color: "var(--ink-900)",
  cursor: "pointer",
};

function ImageEditor({
  slide,
  busy,
  onGenerate,
  onPromptChange,
  onRemove,
}: {
  slide: Slide;
  busy: "idle" | "redraft" | "image" | "export" | "eval" | "fix";
  onGenerate: () => void;
  onPromptChange: (prompt: string) => void;
  onRemove: () => void;
}) {
  const [prompt, setPrompt] = useState(slide.imageIdea ?? "");

  // Sync prompt state when slide changes (redraft may update imageIdea)
  useEffect(() => {
    setPrompt(slide.imageIdea ?? "");
  }, [slide.id, slide.imageIdea]);

  return (
    <div>
      <label
        className="eyebrow"
        style={{ display: "block", marginBottom: 6, fontSize: 10 }}
      >
        Image prompt
      </label>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onBlur={() => {
          if (prompt !== slide.imageIdea) onPromptChange(prompt);
        }}
        placeholder="editorial illustration of..."
        style={{ minHeight: 60, marginBottom: 12 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          variant="primary"
          onClick={onGenerate}
          disabled={busy !== "idle" || !prompt.trim()}
        >
          {busy === "image"
            ? "Generating..."
            : slide.imageData
              ? "Regenerate"
              : "Generate image"}
        </Button>
        <Button variant="ghost" onClick={onRemove}>
          Remove image
        </Button>
      </div>
      {busy === "image" && (
        <div style={{ marginTop: 12 }}>
          <StagedProgress
            compact
            intervalMs={2000}
            stages={[
              "Composing the illustration",
              "Applying the brand style layer",
              "Rendering",
            ]}
          />
        </div>
      )}
    </div>
  );
}

function ChartEditor({
  chartData,
  onChange,
  onRemove,
}: {
  chartData: ChartData;
  onChange: (next: ChartData) => void;
  onRemove: () => void;
}) {
  // Only single-series inline edit for v0; multi-series still renders but
  // isn't editable in this UI.
  const series = chartData.series[0];
  const isMultiSeries = chartData.series.length > 1;

  const setLabel = (i: number, value: string) => {
    const nextLabels = [...chartData.labels];
    nextLabels[i] = value;
    onChange({ ...chartData, labels: nextLabels });
  };
  const setValue = (i: number, value: string) => {
    const parsed = Number(value);
    const nextSeries = chartData.series.map((s, si) => {
      if (si !== 0) return s;
      const nextValues = [...s.values];
      nextValues[i] = Number.isFinite(parsed) ? parsed : 0;
      return { ...s, values: nextValues };
    });
    onChange({ ...chartData, series: nextSeries });
  };
  const addRow = () => {
    onChange({
      ...chartData,
      labels: [...chartData.labels, `Item ${chartData.labels.length + 1}`],
      series: chartData.series.map((s) => ({
        ...s,
        values: [...s.values, 0],
      })),
    });
  };
  const removeRow = (i: number) => {
    if (chartData.labels.length <= 2) return;
    onChange({
      ...chartData,
      labels: chartData.labels.filter((_, idx) => idx !== i),
      series: chartData.series.map((s) => ({
        ...s,
        values: s.values.filter((_, idx) => idx !== i),
      })),
    });
  };
  const toggleType = () => {
    onChange({ ...chartData, type: chartData.type === "bar" ? "line" : "bar" });
  };
  const setSeriesName = (name: string) => {
    onChange({
      ...chartData,
      series: chartData.series.map((s, i) =>
        i === 0 ? { ...s, name } : s
      ),
    });
  };
  const toggleIllustrative = () => {
    onChange({ ...chartData, isDummyData: !chartData.isDummyData });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <Chip active={chartData.type === "bar"} onClick={toggleType}>
          Bar
        </Chip>
        <Chip active={chartData.type === "line"} onClick={toggleType}>
          Line
        </Chip>
        <div style={{ flex: 1 }} />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            color: "var(--ink-700)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={chartData.isDummyData}
            onChange={toggleIllustrative}
          />
          Mark as illustrative
        </label>
      </div>

      {!isMultiSeries && (
        <div style={{ marginBottom: 10 }}>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 4, fontSize: 10 }}
          >
            Series name
          </label>
          <input
            value={series.name}
            onChange={(e) => setSeriesName(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px",
              border: "1px solid var(--ink-100)",
              borderRadius: 6,
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              background: "var(--paper-white)",
            }}
          />
        </div>
      )}

      {isMultiSeries && (
        <div
          className="body-sm"
          style={{
            marginBottom: 10,
            padding: "6px 10px",
            background: "var(--paper-warm-2)",
            borderRadius: 6,
          }}
        >
          Multi-series charts render but aren't editable inline yet. Ask the
          chat panel to modify the data.
        </div>
      )}

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          marginBottom: 10,
        }}
      >
        <thead>
          <tr>
            <th style={tableHeaderStyle}>Label</th>
            <th style={{ ...tableHeaderStyle, width: 120 }}>Value</th>
            <th style={{ ...tableHeaderStyle, width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {chartData.labels.map((label, i) => (
            <tr key={i}>
              <td style={tableCellStyle}>
                <input
                  value={label}
                  onChange={(e) => setLabel(i, e.target.value)}
                  disabled={isMultiSeries}
                  style={tableInputStyle}
                />
              </td>
              <td style={tableCellStyle}>
                <input
                  type="number"
                  value={series.values[i] ?? 0}
                  onChange={(e) => setValue(i, e.target.value)}
                  disabled={isMultiSeries}
                  style={tableInputStyle}
                />
              </td>
              <td style={tableCellStyle}>
                {!isMultiSeries && chartData.labels.length > 2 && (
                  <button
                    onClick={() => removeRow(i)}
                    aria-label="Remove row"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "1px solid var(--ink-100)",
                      background: "var(--paper-white)",
                      color: "var(--ink-500)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8 }}>
        {!isMultiSeries && (
          <Button variant="secondary" onClick={addRow}>
            + Add row
          </Button>
        )}
        <Button variant="ghost" onClick={onRemove}>
          Remove chart
        </Button>
      </div>
    </div>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--ink-500)",
  borderBottom: "1px solid var(--ink-100)",
};

const tableCellStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid var(--paper-warm-2)",
};

const tableInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid var(--ink-100)",
  borderRadius: 4,
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  background: "var(--paper-white)",
};

/**
 * On-slide chart panel. Uses recharts for the visual and a small
 * "Illustrative data" chip when the numbers are fabricated. Palette is
 * anchored on Valon ink + accent so charts feel of-a-piece with the
 * editorial slide, not like a generic dashboard widget.
 */
function ChartPanel({ data }: { data: ChartData }) {
  // Transform to recharts-friendly row array
  const rows = data.labels.map((label, i) => {
    const row: Record<string, string | number> = { label };
    for (const series of data.series) {
      row[series.name] = series.values[i] ?? 0;
    }
    return row;
  });

  const palette = ["#141210", "#D89A4E", "#5A5148", "#B8722E"];

  const Chart = data.type === "line" ? LineChart : BarChart;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        background: "var(--paper-warm-1)",
        border: "1px solid var(--ink-100)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {data.isDummyData && (
        <div
          style={{
            alignSelf: "flex-start",
            padding: "3px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--accent-deep)",
            background: "rgba(216, 154, 78, 0.14)",
            border: "1px solid var(--accent-soft)",
            borderRadius: 999,
          }}
          title="These numbers were fabricated by the AI to illustrate the trend. Replace with actuals before sharing."
        >
          Illustrative data
        </div>
      )}
      <div style={{ flex: 1, minHeight: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#E5E1DA" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#5A5148", fontFamily: "Instrument Sans" }}
              axisLine={{ stroke: "#9B948B" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#5A5148", fontFamily: "Instrument Sans" }}
              axisLine={{ stroke: "#9B948B" }}
              tickLine={false}
              label={
                data.yAxisLabel
                  ? {
                      value: data.yAxisLabel,
                      angle: -90,
                      position: "insideLeft",
                      style: {
                        fontSize: 11,
                        fill: "#5A5148",
                        fontFamily: "Instrument Sans",
                      },
                    }
                  : undefined
              }
            />
            <Tooltip
              contentStyle={{
                fontFamily: "Instrument Sans",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #E5E1DA",
              }}
            />
            {data.series.length > 1 && (
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Instrument Sans" }} />
            )}
            {data.series.map((s, i) =>
              data.type === "line" ? (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  stroke={palette[i % palette.length]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: palette[i % palette.length] }}
                >
                  <LabelList
                    dataKey={s.name}
                    position="top"
                    offset={8}
                    style={{
                      fontSize: 11,
                      fill: "#141210",
                      fontFamily: "Instrument Sans",
                      fontWeight: 500,
                    }}
                  />
                </Line>
              ) : (
                <Bar
                  key={s.name}
                  dataKey={s.name}
                  fill={palette[i % palette.length]}
                  radius={[2, 2, 0, 0]}
                >
                  <LabelList
                    dataKey={s.name}
                    position="top"
                    offset={6}
                    style={{
                      fontSize: 11,
                      fill: "#141210",
                      fontFamily: "Instrument Sans",
                      fontWeight: 500,
                    }}
                  />
                </Bar>
              )
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      {data.caption && (
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            color: "var(--ink-500)",
          }}
        >
          {data.caption}
        </div>
      )}
    </div>
  );
}

function SlideRailItem({
  slide,
  index,
  selected,
  canDelete,
  isDragging,
  dropIndicator,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  slide: Slide;
  index: number;
  selected: boolean;
  canDelete: boolean;
  isDragging: boolean;
  dropIndicator: "above" | "below" | null;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (position: "above" | "below") => void;
  onDrop: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Some browsers require data to be set
        e.dataTransfer.setData("text/plain", String(index));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        onDragOver(e.clientY < midY ? "above" : "below");
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        marginBottom: 6,
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
      }}
    >
      {dropIndicator === "above" && (
        <div
          style={{
            position: "absolute",
            top: -3,
            left: 0,
            right: 0,
            height: 2,
            background: "var(--accent)",
            borderRadius: 1,
            pointerEvents: "none",
          }}
        />
      )}
      <button
        onClick={onSelect}
        style={{
          display: "block",
          width: "100%",
          padding: "10px 32px 10px 12px",
          borderRadius: "var(--radius-sm)",
          border: selected
            ? "1px solid var(--ink-900)"
            : "1px solid transparent",
          background: selected ? "var(--paper-warm-2)" : "transparent",
          textAlign: "left",
          fontSize: 12,
          lineHeight: 1.3,
          cursor: "pointer",
        }}
      >
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-500)", marginBottom: 3 }}>
          {String(index + 1).padStart(2, "0")} · {slide.layout}
        </div>
        <div style={{ color: "var(--ink-900)", fontWeight: 500 }}>
          {slide.heading || "Untitled slide"}
        </div>
      </button>
      {canDelete && hover && !isDragging && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete slide ${index + 1}`}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "1px solid var(--ink-100)",
            background: "var(--paper-white)",
            color: "var(--ink-500)",
            fontSize: 12,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          ×
        </button>
      )}
      {dropIndicator === "below" && (
        <div
          style={{
            position: "absolute",
            bottom: -3,
            left: 0,
            right: 0,
            height: 2,
            background: "var(--accent)",
            borderRadius: 1,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

/**
 * Editable content block: click to edit, blur to save. Uncontrolled DOM
 * plus a parent-controlled value with an effect to sync when the value
 * changes externally (e.g. after a redraft).
 */
function EditableText({
  value,
  onChange,
  singleLine,
  placeholder,
  style,
  onBackspaceEmpty,
}: {
  value: string;
  onChange: (next: string) => void;
  singleLine?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  onBackspaceEmpty?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef(value);

  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
      lastValue.current = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-placeholder={placeholder}
      onBlur={() => {
        const text = ref.current?.innerText ?? "";
        if (text !== lastValue.current) {
          lastValue.current = text;
          onChange(text);
        }
      }}
      onKeyDown={(e) => {
        if (singleLine && e.key === "Enter") {
          e.preventDefault();
          ref.current?.blur();
          return;
        }
        if (
          e.key === "Backspace" &&
          onBackspaceEmpty &&
          (ref.current?.innerText ?? "") === ""
        ) {
          e.preventDefault();
          onBackspaceEmpty();
        }
      }}
      style={{
        outline: "none",
        cursor: "text",
        borderRadius: 4,
        padding: "2px 4px",
        margin: "-2px -4px",
        transition: "background 120ms ease",
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.background = "var(--paper-warm-2)";
      }}
      onBlurCapture={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {value}
    </div>
  );
}

/**
 * Live slide editor. Renders the slide 16:9 and lets you click on the
 * heading, subheading, or any bullet to edit. Blur saves.
 */
function SlideEditor({
  slide,
  onChange,
}: {
  slide: Slide;
  onChange: (next: Slide) => void;
}) {
  const hasChart = Boolean(slide.chartData);
  const hasImage = Boolean(slide.imageData) && !hasChart;
  const hasSideVisual = hasChart || hasImage;

  const setHeading = (v: string) => onChange({ ...slide, heading: v });
  const setSubheading = (v: string) =>
    onChange({ ...slide, subheading: v.trim() ? v : undefined });
  const setBullet = (i: number, v: string) => {
    const next = [...slide.bullets];
    next[i] = v;
    // If the bullet is now empty, remove it.
    onChange({ ...slide, bullets: next.filter((b) => b.trim().length > 0) });
  };
  const deleteBullet = (i: number) =>
    onChange({ ...slide, bullets: slide.bullets.filter((_, idx) => idx !== i) });
  const addBullet = () =>
    onChange({ ...slide, bullets: [...slide.bullets, "New bullet"] });

  return (
    <Card
      style={{
        aspectRatio: "16 / 9",
        padding: "48px 56px",
        background:
          slide.layout === "section" ? "var(--ink-900)" : "var(--paper-white)",
        color:
          slide.layout === "section" ? "var(--paper-white)" : "var(--ink-900)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {slide.layout === "title" && (
        <>
          <div style={{ flex: 1 }} />
          <EditableText
            value={slide.heading}
            onChange={setHeading}
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              fontSize: "clamp(32px, 5vw, 54px)",
              lineHeight: 1.06,
              marginBottom: 16,
            }}
          />
          <EditableText
            value={slide.subheading ?? ""}
            onChange={setSubheading}
            placeholder="Subtitle"
            singleLine
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              color: "var(--ink-500)",
              minHeight: 24,
            }}
          />
          <div style={{ flex: 1 }} />
          <div style={{ width: 40, height: 3, background: "var(--accent)" }} />
        </>
      )}

      {slide.layout === "section" && (
        <>
          <div style={{ flex: 1 }} />
          <EditableText
            value={slide.heading}
            onChange={setHeading}
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              fontSize: "clamp(28px, 4.2vw, 46px)",
              lineHeight: 1.1,
              color: "var(--paper-white)",
              marginBottom: 12,
            }}
          />
          <div style={{ flex: 1 }} />
          <div style={{ width: 40, height: 3, background: "var(--accent)" }} />
        </>
      )}

      {slide.layout === "content" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: hasSideVisual ? "1.1fr 1fr" : "1fr",
            gap: 44,
            height: "100%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Title block: heading + gold delineation dash */}
            <div style={{ marginBottom: 24 }}>
              <EditableText
                value={slide.heading}
                onChange={setHeading}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontWeight: 700,
                  fontSize: "clamp(26px, 3vw, 38px)",
                  lineHeight: 1.12,
                  letterSpacing: "-0.02em",
                  color: "var(--ink-900)",
                  marginBottom: 14,
                }}
              />
              <div
                style={{
                  width: 56,
                  height: 3,
                  background: "var(--accent)",
                  borderRadius: 2,
                }}
              />
              {slide.subheading !== undefined && slide.subheading !== "" && (
                <div style={{ marginTop: 14 }}>
                  <EditableText
                    value={slide.subheading ?? ""}
                    onChange={setSubheading}
                    placeholder="Subtitle"
                    singleLine
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 15,
                      color: "var(--ink-500)",
                    }}
                  />
                </div>
              )}
            </div>

            <ul
              style={{
                listStyle: "none",
                paddingLeft: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              {slide.bullets.map((b, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      background: "var(--accent)",
                      borderRadius: "50%",
                      marginTop: 11,
                      flexShrink: 0,
                    }}
                  />
                  <EditableText
                    value={b}
                    onChange={(v) => setBullet(i, v)}
                    onBackspaceEmpty={() => deleteBullet(i)}
                    placeholder="Bullet text"
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 17,
                      lineHeight: 1.45,
                      color: "var(--ink-700)",
                      flex: 1,
                    }}
                  />
                </li>
              ))}
              <li>
                <button
                  onClick={addBullet}
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    color: "var(--ink-500)",
                    padding: "5px 12px",
                    border: "1px dashed var(--ink-300)",
                    borderRadius: 999,
                    background: "transparent",
                    cursor: "pointer",
                    marginTop: 4,
                  }}
                >
                  + Add bullet
                </button>
              </li>
            </ul>

            <div style={{ flex: 1 }} />
          </div>
          {hasChart && slide.chartData && (
            <ChartPanel data={slide.chartData} />
          )}
          {hasImage && (
            <div
              style={{
                background: "var(--paper-warm-2)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.imageData}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Valon watermark bottom-right */}
          <div
            style={{
              position: "absolute",
              right: 40,
              bottom: 28,
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--ink-500)",
              opacity: 0.7,
            }}
          >
            valon
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--accent)",
                marginLeft: 2,
              }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
