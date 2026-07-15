"use client";

import { useEffect, useState } from "react";
import { Sunburst } from "../brand/Sunburst";

/**
 * Staged progress indicator for long model calls.
 *
 * The Gemini calls are single non-streaming requests, so there is no real
 * progress signal. This component narrates the stages of work honestly
 * (they do all happen inside the one call), advancing on a timer and
 * holding on the final stage until the parent unmounts it when the
 * response lands. Standard pattern for making a 10-20 second wait feel
 * attended instead of frozen.
 */
export function StagedProgress({
  stages,
  intervalMs = 2400,
  compact = false,
}: {
  stages: string[];
  intervalMs?: number;
  compact?: boolean;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (idx >= stages.length - 1) return;
    const t = setTimeout(
      () => setIdx((i) => Math.min(i + 1, stages.length - 1)),
      intervalMs
    );
    return () => clearTimeout(t);
  }, [idx, stages.length, intervalMs]);

  return (
    <div>
      <style>{`
        @keyframes slidegen-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slidegen-fade-in {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: compact ? 6 : 10,
        }}
      >
        {stages.map((stage, i) => {
          const done = i < idx;
          const current = i === idx;
          if (compact && i > idx) return null; // upcoming stages stay hidden
          return (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                animation: current ? "slidegen-fade-in 240ms ease" : undefined,
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {done && (
                  <span
                    style={{
                      color: "var(--accent-deep)",
                      fontSize: 12,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                )}
                {current && (
                  <span
                    style={{
                      display: "inline-flex",
                      animation: "slidegen-spin 1.6s linear infinite",
                    }}
                  >
                    <Sunburst size={14} color="var(--accent)" />
                  </span>
                )}
                {!done && !current && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "var(--ink-100)",
                    }}
                  />
                )}
              </span>
              <span
                className="body-sm"
                style={{
                  color: current
                    ? "var(--ink-900)"
                    : done
                      ? "var(--ink-500)"
                      : "var(--ink-300)",
                  fontWeight: current ? 500 : 400,
                }}
              >
                {stage}
                {current && "..."}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
