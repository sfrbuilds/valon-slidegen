import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base = {
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  fontWeight: 500,
  padding: "10px 16px",
  borderRadius: "var(--radius-md)",
  border: "1px solid transparent",
  transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  lineHeight: 1,
  whiteSpace: "nowrap" as const,
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--ink-900)",
    color: "var(--paper-white)",
    borderColor: "var(--ink-900)",
  },
  secondary: {
    background: "var(--paper-white)",
    color: "var(--ink-900)",
    borderColor: "var(--ink-100)",
  },
  ghost: {
    background: "transparent",
    color: "var(--ink-700)",
    borderColor: "transparent",
  },
};

export function Button({
  variant = "primary",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} style={{ ...base, ...variants[variant], ...style }} />;
}
