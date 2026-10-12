/**
 * The media queries Studio's layout switches on, for code that picks a
 * structure rather than a style — a stacked row, a drawer — and so cannot
 * leave the choice to a CSS class.
 */
export const MEDIA = {
  /** Narrower than Tailwind's `sm`: a phone held upright. */
  phone: "(max-width: 639px)",
  /** The shell without its sidebar: a narrow window, or a phone held sideways. */
  compactShell: "(max-width: 820px), (pointer: coarse) and (max-height: 500px)",
  /** A touch screen too short for Studio's bars: a phone held sideways. */
  shortScreen: "(pointer: coarse) and (max-height: 500px)",
  /** A finger rather than a mouse. */
  coarse: "(pointer: coarse)",
} as const;

/** The width of a list below which each row puts its cells on two lines. */
export const STACKED_BELOW = 560;

/** How a list lays out its rows: two lines each, its narrow columns, or its wide ones. */
export type ListTier = "stacked" | "narrow" | "wide";

/**
 * How a list lays out its rows at a width. A width of 0 — not measured yet,
 * or no layout at all, as in a test — is never stacked, so a list keeps the
 * layout it has on a desktop until it knows better.
 *
 * @param width - The list's width in pixels
 * @param wideFrom - The width from which the list shows its wide columns
 * @returns The layout for its rows
 * @example
 * ```ts
 * listTierOf(375, 760); // "stacked"
 * listTierOf(700, 760); // "narrow"
 * listTierOf(0, 760); // "narrow"
 * ```
 */
export function listTierOf(width: number, wideFrom: number): ListTier {
  if (width > 0 && width < STACKED_BELOW) return "stacked";
  return width >= wideFrom ? "wide" : "narrow";
}
