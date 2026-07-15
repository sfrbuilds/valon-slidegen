import { Sunburst } from "./Sunburst";

/**
 * Valon wordmark plus the SlideGen sub-label.
 * Uses Instrument Serif to approximate the Season Serif italic look
 * of the real Valon wordmark.
 */
export function Wordmark({ subLabel = "SlideGen" }: { subLabel?: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 26,
          lineHeight: 1,
          color: "var(--ink-900)",
          letterSpacing: "-0.005em",
        }}
      >
        valon
      </div>
      <Sunburst size={16} color="var(--accent)" />
      {subLabel ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-500)",
            borderLeft: "1px solid var(--ink-100)",
            paddingLeft: 10,
            height: 14,
            display: "flex",
            alignItems: "center",
          }}
        >
          {subLabel}
        </div>
      ) : null}
    </div>
  );
}
