import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* The type scale's own `text-*` utilities (index.css) set the font size.
   Unregistered, tailwind-merge would take them for text colours, drop the
   colour they are combined with, and keep a `text-xs` that overrides them. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "h1", "h2", "h3", "h4", "body-lg", "body", "body-sm", "body-xs", "caption"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
