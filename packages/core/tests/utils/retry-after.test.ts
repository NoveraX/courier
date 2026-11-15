/**
 * A `Retry-After` given as a date is read the same in every engine: each of
 * the three forms HTTP has for one moment — the asctime one, which names no
 * zone, in GMT as HTTP has it — and a two-digit year as the year nearest
 * now that ends in those digits, even across a century's end.
 */
import { describe, expect, it } from "vitest";

import { retryAfterWait } from "../../src/utils/retry-after";

describe("a Retry-After that gives a date", () => {
  const now = Date.UTC(1994, 10, 6, 8, 49, 30);

  it.each([
    "Sun, 06 Nov 1994 08:49:37 GMT",
    "Sunday, 06-Nov-94 08:49:37 GMT",
    "Sun Nov  6 08:49:37 1994",
  ])("asks for the wait until that moment, in GMT, given as %j", (date) => {
    expect(retryAfterWait(date, now)).toBe(7_000);
  });

  it.each([
    [
      "the next century's first",
      "Friday, 01-Jan-00 00:00:01 GMT",
      Date.UTC(2099, 11, 31, 23, 59, 58),
      3_000,
    ],
    [
      "a year fifty years ahead",
      "Monday, 02-Mar-76 09:00:00 GMT",
      Date.UTC(2026, 2, 2, 9),
      Date.UTC(2076, 2, 2, 9) - Date.UTC(2026, 2, 2, 9),
    ],
    [
      "a year past, once fifty-one years ahead",
      "Tuesday, 02-Mar-77 09:00:00 GMT",
      Date.UTC(2026, 2, 2, 9),
      0,
    ],
  ])("reads two digits of the year as %s", (_year, date, at, wait) => {
    expect(retryAfterWait(date, at)).toBe(wait);
  });
});
