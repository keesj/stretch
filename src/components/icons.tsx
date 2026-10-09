import type { SVGProps } from "react";

/**
 * Stroke line-art icons matching the app's pose-figure style: 24px
 * viewBox, rounded 2px strokes, currentColor so the surrounding text
 * color (active/inactive, light/dark) applies.
 */
function base(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20Z" />
      <path d="M9 21.5v-8h6v8" />
    </svg>
  );
}

export function ProgressIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 17.5 9.5 11l4 4L21 7" />
      <path d="M15.5 7H21v5.5" />
    </svg>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M21 5h-7" />
      <path d="M8 5H3" />
      <path d="M21 12h-9" />
      <path d="M6 12H3" />
      <path d="M21 19h-5" />
      <path d="M10 19H3" />
      <circle cx="10" cy="5" r="2" />
      <circle cx="14" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
