"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { NewPresentationForm } from "@/components/NewPresentationForm";
import { TEAM_LABELS, AUDIENCE_LABELS } from "@/lib/types";

/**
 * Landing page, prompt-first: the brief box is the front door (the same
 * pattern as every chat-first tool people already use). The library is
 * retrieval and lives below the form.
 */
export default function HomePage() {
  const { decks, deleteDeck } = useStore();

  return (
    <div className="page">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <Wordmark subLabel={null} />
        <Link href="/about">
          <Button variant="ghost">About</Button>
        </Link>
      </header>

      <div
        style={{
          textAlign: "center",
          margin: "28px auto 32px",
          maxWidth: 680,
        }}
      >
        <h1 className="h-display" style={{ marginBottom: 10 }}>
          SlideGen
        </h1>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 21,
            fontWeight: 500,
            color: "var(--ink-700)",
            marginBottom: 10,
          }}
        >
          Draft effective presentations, in minutes.
        </p>
        <p className="body-md" style={{ maxWidth: 620, margin: "0 auto" }}>
          Enter a short brief on what your presentation should cover, and
          SlideGen drafts every slide. Edit them directly, refine in chat,
          and export to PowerPoint or Google Slides.
        </p>
      </div>

      <NewPresentationForm />

      {decks.length > 0 && (
        <div style={{ marginTop: 56 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Your presentations
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 20,
            }}
          >
            {decks.map((deck) => (
              <Card key={deck.id} style={{ padding: 20 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  {TEAM_LABELS[deck.team]} · {AUDIENCE_LABELS[deck.audience]}
                </div>
                <Link href={`/decks/${deck.id}`}>
                  <h3 className="h-medium" style={{ marginBottom: 8 }}>
                    {deck.title}
                  </h3>
                </Link>
                <p className="body-sm" style={{ marginBottom: 16 }}>
                  {deck.slides.length} slides · updated {formatDate(deck.updatedAt)}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/decks/${deck.id}`}>
                    <Button variant="secondary">Open</Button>
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${deck.title}"?`)) deleteDeck(deck.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
