import type { ButtonHTMLAttributes } from "react";

export function Chip({
  active,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      style={{
        padding: "8px 14px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--ink-900)" : "var(--ink-100)"}`,
        background: active ? "var(--ink-900)" : "var(--paper-white)",
        color: active ? "var(--paper-white)" : "var(--ink-700)",
        fontFamily: "var(--font-sans)",
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1,
        transition: "all 120ms ease",
        ...style,
      }}
    />
  );
}
