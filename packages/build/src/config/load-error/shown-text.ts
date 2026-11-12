import { sliceWhole } from "@noverax/courier/internal";

import { withoutSecrets } from "./without-secrets";

/** The longest part of the project's own message a load error quotes, in characters. */
const MAX_QUOTED_LENGTH = 300;

/**
 * The first line of a message the project's code wrote, as a load error
 * quotes it: no secret left in it, as `withoutSecrets` leaves none, its
 * terminal codes and control characters taken out, and cut short past 300
 * characters. The whole text is read as the code wrote it before a line is
 * taken, since a value is found only as it stands — a line break, a control
 * character and all.
 *
 * @param text - The message
 * @returns The line to quote
 * @example
 * ```ts
 * shownText("Invalid environment variables\n  DATABASE_URL: Required"); // "Invalid environment variables"
 * ```
 */
export function shownText(text: string): string {
  const line = (withoutSecrets(text).split("\n", 1)[0] ?? "").replace(/\t/g, " ").trim();
  return line.length > MAX_QUOTED_LENGTH ? `${sliceWhole(line, MAX_QUOTED_LENGTH)}…` : line;
}
