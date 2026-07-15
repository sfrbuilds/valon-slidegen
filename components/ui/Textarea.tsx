import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  style,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        minHeight: 100,
        padding: "12px 14px",
        background: "var(--paper-white)",
        border: "1px solid var(--ink-100)",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-sans)",
        fontSize: 15,
        color: "var(--ink-900)",
        lineHeight: 1.5,
        outline: "none",
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--ink-500)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--ink-100)";
        props.onBlur?.(e);
      }}
    />
  );
}
