import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* The type scales' own `text-*` utilities (index.css, design/tokens.css) set
   the font size, and the design's `font-*` weights a weight. Unregistered,
   tailwind-merge would take a size for a text colour and a weight for a
   font family, and drop the class it is combined with. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "h1",
            "h2",
            "h3",
            "h4",
            "body-lg",
            "body",
            "body-sm",
            "body-xs",
            "caption",
            "micro",
            "meta",
            "badge",
            "label",
            "small",
            "control",
            "ui",
            "item",
            "title",
            "lead",
            "prompt",
            "heading",
            "figure",
            "metric",
            "wordmark",
            "stat",
            "page",
            "kpi",
            "hero",
            "score",
          ],
        },
      ],
      "font-weight": [{ font: ["strong", "wordmark"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
