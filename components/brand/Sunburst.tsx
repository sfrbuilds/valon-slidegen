/**
 * 8-pointed star sunburst, sampled from Valon wordmark.
 * Rendered as an inline SVG so it stays crisp at any size.
 */
export function Sunburst({ size = 20, color = "#D89A4E" }: { size?: number; color?: string }) {
  // Eight sharp rays fanning from a small center.
  const rays = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g transform="translate(20 20)">
        {rays.map((angle, i) => (
          <polygon
            key={i}
            points="0,-18 2.6,0 0,2.6 -2.6,0"
            fill={color}
            transform={`rotate(${angle})`}
          />
        ))}
        <circle r="2" fill={color} />
      </g>
    </svg>
  );
}
