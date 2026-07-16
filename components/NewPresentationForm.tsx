"use client";

/**
 * The prompt-first creation form. Lives on the landing page (the prompt
 * box is the product; the library is retrieval), extracted here so any
 * route can render it. On success it navigates to the new workspace.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Chip } from "@/components/ui/Chip";
import { StagedProgress } from "@/components/ui/StagedProgress";
import { useStore } from "@/lib/store";
import {
  TEAMS,
  AUDIENCES,
  TEAM_LABELS,
  AUDIENCE_LABELS,
  CONTEXT_DOC_CHAR_CAP,
  makeId,
  nowIso,
  type Team,
  type Audience,
  type ContextDoc,
  type DraftDeckRequest,
  type DraftDeckResponse,
  type Deck,
} from "@/lib/types";
import { BLANK_TEMPLATE_ID, TEMPLATES, templateById, type Template } from "@/lib/templates";
import { getTone } from "@/lib/tones";
import { detectsChartIntent } from "@/lib/chart-intent";

export function NewPresentationForm() {
  const router = useRouter();
  const { saveDeck, templates: customTemplates, deleteTemplate } = useStore();
  const [brief, setBrief] = useState("");
  const [team, setTeam] = useState<Team>("new-ventures");
  const [audience, setAudience] = useState<Audience>("internal");
  // null = Auto: the deck is sized by the brief. A user who writes
  // "6 slides: slide 1..., slide 2..." should never have that concept
  // bulldozed by a forced count; explicit counts are opt-in.
  const [targetLength, setTargetLength] = useState<number | null>(null);
  const [contextDoc, setContextDoc] = useState<ContextDoc | null>(null);
  const [templateId, setTemplateId] = useState<string>(BLANK_TEMPLATE_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Built-ins resolve from code; customs from the store. Same type, so
  // the preview and length UI downstream don't care which kind it is.
  const resolveTemplate = (id: string): Template | null =>
    templateById(id === BLANK_TEMPLATE_ID ? null : id) ??
    customTemplates.find((t) => t.id === id) ??
    null;

  const selectedTemplate = resolveTemplate(templateId);
  const selectedIsCustom = customTemplates.some((t) => t.id === templateId);
  const tone = getTone(team, audience);

  function handleTemplateChange(nextId: string) {
    setTemplateId(nextId);
    const tpl = resolveTemplate(nextId);
    if (tpl) {
      setTeam(tpl.defaultTeam);
      setAudience(tpl.defaultAudience);
      setTargetLength(tpl.targetLength);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    try {
      let text = "";
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const arrayBuffer = await file.arrayBuffer();
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
        const { text: pages } = await extractText(pdf, { mergePages: true });
        text = Array.isArray(pages) ? pages.join("\n\n") : pages;
      } else if (
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.endsWith(".docx")
      ) {
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        text = await file.text();
      }
      const truncated = text.length > CONTEXT_DOC_CHAR_CAP;
      setContextDoc({
        filename: file.name,
        text: text.slice(0, CONTEXT_DOC_CHAR_CAP),
        truncated,
        uploadedAt: nowIso(),
      });
    } catch (e) {
      setError(`Could not read file: ${(e as Error).message}`);
    }
  }

  async function handleDraft() {
    if (!brief.trim()) {
      setError("Add a brief before drafting.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: DraftDeckRequest = {
        brief: brief.trim(),
        team,
        audience,
        targetLength,
        contextDoc,
        templateId: templateId === BLANK_TEMPLATE_ID ? null : templateId,
        // Custom templates only exist in this browser's storage, so the
        // server gets the whole outline, not just an id it cannot resolve.
        customTemplate: selectedIsCustom ? selectedTemplate : null,
      };
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Draft failed (${res.status})`);
      }
      const data = (await res.json()) as DraftDeckResponse;
      const deck: Deck = {
        id: makeId("deck"),
        title: data.deckTitle,
        team,
        audience,
        brief: brief.trim(),
        // Auto mode has no requested count; record what was drafted.
        targetLength: targetLength ?? data.slides.length,
        contextDoc,
        templateId: templateId === BLANK_TEMPLATE_ID ? null : templateId,
        slides: data.slides,
        // A non-fatal draft warning (e.g. requested chart missing after a
        // retry) surfaces as the first chat message so it lands in the
        // workspace the user is about to see.
        chatHistory: data.warning
          ? [
              {
                id: makeId("msg"),
                role: "assistant" as const,
                content: data.warning,
                timestamp: nowIso(),
                scope: "deck" as const,
              },
            ]
          : [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      saveDeck(deck);
      router.push(`/decks/${deck.id}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <div>
      <Card style={{ padding: 32, marginBottom: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 10 }}
          >
            Brief
          </label>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Please enter a paragraph or two. What's the presentation for, who is the audience, what's the story? The clearer the brief, the better the draft."
            style={{ minHeight: 140 }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 10 }}
          >
            Template (optional)
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            <TemplateTile
              active={templateId === BLANK_TEMPLATE_ID}
              name="Blank"
              description="Freeform. Start from your brief only."
              onClick={() => handleTemplateChange(BLANK_TEMPLATE_ID)}
            />
            {TEMPLATES.map((tpl) => (
              <TemplateTile
                key={tpl.id}
                active={templateId === tpl.id}
                template={tpl}
                onClick={() => handleTemplateChange(tpl.id)}
              />
            ))}
            {customTemplates.map((tpl) => (
              <TemplateTile
                key={tpl.id}
                active={templateId === tpl.id}
                template={tpl}
                custom
                onClick={() => handleTemplateChange(tpl.id)}
                onDelete={() => {
                  if (templateId === tpl.id) handleTemplateChange(BLANK_TEMPLATE_ID);
                  deleteTemplate(tpl.id);
                }}
              />
            ))}
          </div>
        </div>

        {/* Team + audience share one row. Grid, not wrapping flex: a
            wrapping flex container places items by their UNSHRUNK size,
            so the tone line never got to truncate — the row just wrapped
            (visibly, when selecting the team with the longest tone name).
            Grid's minmax(0, 1fr) forces the audience cell to stay in row
            and lets the tone text ellipsize instead. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            columnGap: 48,
            marginBottom: 24,
          }}
        >
          <div>
            <label
              className="eyebrow"
              style={{ display: "block", marginBottom: 10 }}
            >
              Team
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TEAMS.map((t) => (
                <Chip
                  key={t}
                  active={team === t}
                  onClick={() => setTeam(t)}
                >
                  {TEAM_LABELS[t]}
                </Chip>
              ))}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <label
              className="eyebrow"
              style={{ display: "block", marginBottom: 10 }}
            >
              Audience
            </label>
            {/* flexWrap here is the narrow-window fallback: the tone line
                drops below the chips instead of clipping. */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
              {AUDIENCES.map((a) => (
                <Chip
                  key={a}
                  active={audience === a}
                  onClick={() => setAudience(a)}
                  style={{ flexShrink: 0 }}
                >
                  {AUDIENCE_LABELS[a]}
                </Chip>
              ))}
              <HoverCard
                inline
                style={{ minWidth: 0, flex: "0 1 auto" }}
                trigger={
                <span
                  className="body-sm"
                  style={{
                    color: "var(--ink-500)",
                    borderBottom: "1px dotted var(--ink-300)",
                    cursor: "help",
                    display: "block",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  Tone: {tone.name}
                </span>
              }
            >
              {/* Name the tone in the card: the inline trigger may be
                  truncated when the row is tight. */}
              <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>
                {tone.name}
              </div>
              <div className="body-sm" style={{ marginBottom: 10, color: "var(--ink-700)" }}>
                {tone.description}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-500)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Writes like
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 14 }}>
                    {tone.rules.map((r, i) => (
                      <li key={i} className="body-sm" style={{ color: "var(--ink-700)", marginBottom: 2 }}>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-500)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Never
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 14 }}>
                    {tone.avoid.map((a, i) => (
                      <li key={i} className="body-sm" style={{ color: "var(--ink-700)", marginBottom: 2 }}>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </HoverCard>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 10 }}
          >
            Target length
          </label>
          {selectedTemplate ? (
            <div className="body-sm" style={{ color: "var(--ink-500)" }}>
              Set by the &ldquo;{selectedTemplate.name}&rdquo; template:{" "}
              {selectedTemplate.outline.length} slides. Choose Blank for a
              custom length.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip
                active={targetLength === null}
                onClick={() => setTargetLength(null)}
                title="Freeform: no enforced slide count. The model follows any structure or count in your brief, otherwise picks what serves it best."
              >
                Auto
              </Chip>
              {[1, 3, 5, 8, 10, 12, 15].map((n) => (
                <Chip
                  key={n}
                  active={targetLength === n}
                  onClick={() => setTargetLength(n)}
                >
                  {n === 1 ? "1 slide" : `${n} slides`}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 10 }}
          >
            Reference document (optional)
          </label>
          {contextDoc ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--paper-warm-2)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--ink-100)",
              }}
            >
              <div>
                <div className="body-md">{contextDoc.filename}</div>
                <div className="body-sm">
                  {contextDoc.text.length.toLocaleString()} characters
                  {contextDoc.truncated ? " (truncated)" : ""}
                </div>
              </div>
              <Button variant="ghost" onClick={() => setContextDoc(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <label
              style={{
                display: "block",
                padding: "18px",
                border: "1px dashed var(--ink-300)",
                borderRadius: "var(--radius-md)",
                textAlign: "center",
                cursor: "pointer",
                color: "var(--ink-500)",
              }}
            >
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              Click to upload PDF, DOCX, TXT, or MD
            </label>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              marginTop: 24,
              borderRadius: "var(--radius-md)",
              background: "#F9E4E4",
              color: "var(--error)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Footer: the submit lives inside the card it submits. */}
        <div style={{ marginTop: 28 }}>
          {loading ? (
            <div
              style={{
                paddingTop: 20,
                borderTop: "1px solid var(--ink-100)",
              }}
            >
              <div className="eyebrow" style={{ marginBottom: 12, fontSize: 10 }}>
                Drafting your presentation
              </div>
              <StagedProgress
                stages={[
                  contextDoc
                    ? `Reading your brief and ${contextDoc.filename}`
                    : "Reading your brief",
                  `Applying the ${tone.name} tone`,
                  selectedTemplate
                    ? `Laying out the ${selectedTemplate.name} structure (${selectedTemplate.outline.length} slides)`
                    : targetLength === null
                      ? "Sizing the deck from your brief"
                      : `Laying out ${targetLength} slide${targetLength === 1 ? "" : "s"}`,
                  ...(detectsChartIntent(brief) ? ["Building chart data"] : []),
                  "Writing slide copy",
                  "Polishing headings",
                ]}
              />
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" onClick={handleDraft} disabled={loading}>
                Create presentation
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Hover-revealed detail card. Keeps the form minimal: the trigger stays a
 * single line, the detail appears after a short hover delay so the
 * popover doesn't flicker while the cursor crosses the page.
 */
function HoverCard({
  trigger,
  children,
  width = 420,
  inline = false,
  style,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  // inline: trigger is a text span; block: trigger fills its grid cell.
  inline?: boolean;
  // Merged onto the wrapper, e.g. minWidth 0 so a flex parent can shrink
  // the trigger (ellipsis) instead of wrapping the row.
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const enter = () => {
    timer.current = window.setTimeout(() => setOpen(true), 180);
  };
  const leave = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  };

  return (
    <div
      onMouseEnter={enter}
      onMouseLeave={leave}
      style={{
        position: "relative",
        display: inline ? "inline-block" : "block",
        height: inline ? undefined : "100%",
        ...style,
      }}
    >
      {trigger}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width,
            maxWidth: "80vw",
            padding: "14px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--paper-white)",
            border: "1px solid var(--ink-100)",
            boxShadow: "var(--shadow-md)",
            zIndex: 30,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function TemplateTile({
  active,
  onClick,
  template,
  name,
  description,
  custom = false,
  onDelete,
}: {
  active: boolean;
  onClick: () => void;
  template?: Template;
  name?: string;
  description?: string;
  custom?: boolean;
  onDelete?: () => void;
}) {
  const displayName = template?.name ?? name ?? "";
  const displayDescription = template?.description ?? description ?? "";

  const tile = (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        width: "100%",
        height: "100%",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: active ? "1.5px solid var(--ink-900)" : "1px solid var(--ink-100)",
        background: active ? "var(--paper-warm-2)" : "var(--paper-white)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {/* minWidth 0 + overflowWrap: user-authored names can be long
            unbroken tokens ("release_preview_internal") that would
            otherwise push the tag/count/delete outside the tile.
            Multi-word names still wrap at spaces like the built-ins. */}
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink-900)",
            minWidth: 0,
            overflowWrap: "anywhere",
          }}
        >
          {displayName}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {custom && (
            <span
              className="mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--accent-deep)",
                background: "rgba(216, 154, 78, 0.14)",
                border: "1px solid var(--accent-soft)",
                borderRadius: 999,
                padding: "1px 6px",
              }}
            >
              Custom
            </span>
          )}
          {template && (
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-500)" }}>
              {template.outline.length} slides
            </span>
          )}
          {/* Span, not button: the tile itself is already a button and
              nested buttons are invalid HTML. */}
          {onDelete && (
            <span
              role="button"
              aria-label={`Delete template ${displayName}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{
                color: "var(--ink-500)",
                fontSize: 14,
                lineHeight: 1,
                padding: "0 2px",
                cursor: "pointer",
              }}
            >
              ×
            </span>
          )}
        </span>
      </div>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          color: "var(--ink-500)",
          lineHeight: 1.4,
        }}
      >
        {displayDescription}
      </span>
    </button>
  );

  if (!template) return tile;

  return (
    <HoverCard width={380} trigger={tile}>
      <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>
        Outline · {template.name}
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {template.outline.map((s, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "baseline",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              color: "var(--ink-700)",
              lineHeight: 1.45,
            }}
          >
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-500)", flexShrink: 0 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>
              {s.heading}
              {s.layout !== "content" && (
                <span style={{ color: "var(--ink-500)" }}> · {s.layout}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <div className="body-sm" style={{ marginTop: 8, color: "var(--ink-500)" }}>
        The outline shapes the structure; the model writes the copy from your brief.
      </div>
    </HoverCard>
  );
}
