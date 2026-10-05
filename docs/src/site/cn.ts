import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/* The site's own `text-*` sizes (site/tokens.css). Unregistered,
   tailwind-merge would take a size for a text colour and drop the class it
   is combined with. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro",
            "meta",
            "label",
            "small",
            "control",
            "nav",
            "callout",
            "body",
            "lead",
            "h3",
            "h2",
            "h1",
            "code",
          ],
        },
      ],
    },
  },
})

/**
 * Class names joined, later ones winning where two set the same thing.
 *
 * @param inputs - Class names, conditional ones included
 * @returns The classes
 * @example
 * ```ts
 * cn("text-meta text-fg-subtle", on && "text-fg") // "text-meta text-fg"
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
