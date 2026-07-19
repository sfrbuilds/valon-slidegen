"use client";

/**
 * User-facing About page: what SlideGen is, what it does, what's under
 * the hood, and where its limits are. Written for a Valon colleague
 * opening the tool for the first time, not for a code reviewer (that
 * material lives in the repo's README and DECISIONS.md).
 */

import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function AboutPage() {
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 40,
        }}
      >
        <Link href="/">
          <Wordmark />
        </Link>
        <Link href="/">
          <Button variant="ghost">← Home</Button>
        </Link>
      </header>

      <div style={{ marginBottom: 36 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          About
        </div>
        <h1 className="h-display">What SlideGen is, and how it works.</h1>
      </div>

      <Section title="What it is">
        <p>
          SlideGen is an internal Valon tool that turns a written brief into
          a complete, editable presentation. You describe what the
          presentation should say, pick which team it comes from and who it
          is for, and SlideGen drafts every slide. From there you refine it
          like a document: click any text to edit it, or tell the built-in
          chat what to change.
        </p>
      </Section>

      <Section title="What it does">
        <FeatureGrid
          features={[
            {
              name: "First draft from a brief",
              text: "A paragraph or two in, a full presentation out. Attach up to three reference documents (PDF, DOCX, TXT, MD) and the draft is grounded in it.",
            },
            {
              name: "Templates for common formats",
              text: "Investor updates, board updates, pipeline reviews, launch briefs, and more. Each is a proven slide structure; the copy still comes from your brief.",
            },
            {
              name: "Revision by chat",
              text: "Ask for changes to one slide or the whole presentation: shorten it, punch it up, add a chart, remove an image. Context carries across turns.",
            },
            {
              name: "Real, editable charts",
              text: "Bar and line charts land in PowerPoint as native chart objects, not pictures. Data, labels, and axis titles stay editable after export.",
            },
            {
              name: "Team-aware writing",
              text: "Eight writing profiles, one per team and audience pair. A board update and a customer pitch follow different rules; hover the tone line to see them.",
            },
            {
              name: "Review",
              text: "One click reviews every slide against the writing rules and quotes anything off. A second click applies the smallest fix for each finding.",
            },
          ]}
        />
      </Section>

      <Section title="Under the hood">
        <p>
          The writing and the charts come from Google&apos;s Gemini 2.5 Flash
          model; slide illustrations come from Gemini&apos;s image model with
          a fixed Valon style layer. The model&apos;s output is structured
          and validated before it touches your presentation, so a bad
          response becomes an error message, never a corrupted slide.
        </p>
        <p>
          Your presentations are stored in your own browser, not on a
          server. Nothing you draft leaves your machine except the calls to
          the Gemini API. Exports are real PowerPoint files: every text box,
          bullet, and chart is a native object you can edit in PowerPoint or
          Google Slides.
        </p>
      </Section>

      <Section title="What to watch for">
        <p>
          If your brief includes real numbers, SlideGen uses them. If you
          ask for a chart without providing numbers, it invents a plausible
          series and marks the chart with an{" "}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--accent-deep)",
              background: "rgba(216, 154, 78, 0.14)",
              border: "1px solid var(--accent-soft)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            Illustrative data
          </span>{" "}
          chip, on screen and in the export. Replace those numbers with
          actuals before the presentation goes anywhere real.
        </p>
        <p>
          Review is a second reader, not an approver: it catches tone
          violations, it does not verify facts. You remain the editor of
          record for anything you send.
        </p>
      </Section>

      <Section title="Writing a brief that drafts well">
        <p>
          We call the input a brief, not a prompt, on purpose: it should
          brief SlideGen the way you would brief a colleague taking over the
          deck. Say what the presentation is for and who will read it.
          Include the numbers that matter, exactly as you want them to
          appear. Name the decision or ask if there is one. A brief like
          &ldquo;5-slide board update: ARR $250M, 40% YoY, runway 22 months,
          decision needed on the Phoenix expansion&rdquo; will draft
          dramatically better than &ldquo;make a deck about Q3&rdquo;.
        </p>
      </Section>

      <Section title="Help shape it">
        <p>
          SlideGen improves by request. If a template is missing, a tone rule
          reads wrong, or the draft keeps making the same mistake for your
          team, say so: small flags now shape what gets built next.
        </p>
      </Section>

      <Card style={{ padding: 28, textAlign: "center", marginTop: 8 }}>
        <p className="body-lg" style={{ marginBottom: 16 }}>
          The fastest way to understand it is to draft something.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Link href="/">
            <Button variant="primary">Draft a presentation</Button>
          </Link>
          {/* No backend in this build, so feedback rides on email. The
              alias is a placeholder for the team distro. */}
          <a href="mailto:slidegen-feedback@valon.com?subject=SlideGen%20feedback&body=What%20I%20was%20trying%20to%20do%3A%0A%0AWhat%20happened%20(or%20what%27s%20missing)%3A%0A%0AHow%20important%20is%20it%20(nice-to-have%20%2F%20blocking)%3A%0A">
            <Button variant="secondary">Send feedback or request a feature</Button>
          </a>
        </div>
      </Card>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          fontSize: 16,
          lineHeight: 1.6,
          color: "var(--ink-700)",
          maxWidth: 720,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function FeatureGrid({
  features,
}: {
  features: { name: string; text: string }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}
    >
      {features.map((f) => (
        <div
          key={f.name}
          style={{
            padding: "14px 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--ink-100)",
            background: "var(--paper-white)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink-900)",
              marginBottom: 6,
            }}
          >
            {f.name}
          </div>
          <div className="body-sm" style={{ color: "var(--ink-700)", lineHeight: 1.5 }}>
            {f.text}
          </div>
        </div>
      ))}
    </div>
  );
}
