/// <reference types="node" />
/**
 * A docs page's date: the `updated` field of its metadata export, which
 * the site shows on the page and hands to search engines. What
 * `check-page-dates.mjs` reads and writes, without git.
 */

const UPDATED = /\bupdated:\s*"([^"]*)"/;
const PAGE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY = 24 * 60 * 60 * 1000;

/** The first and last line of a page's metadata export, or `null` when it has none. */
function metadataLines(lines) {
  const start = lines.findIndex((line) => line.startsWith("export const metadata"));
  if (start < 0) return null;
  let depth = 0;
  for (let end = start; end < lines.length; end++) {
    const line = lines[end];
    depth += (line.match(/[{[]/g)?.length ?? 0) - (line.match(/[}\]]/g)?.length ?? 0);
    if (depth <= 0) return { start, end };
  }
  return { start, end: lines.length - 1 };
}

/** A page split around its metadata export: the lines before, the export, the lines after. */
function splitPage(source) {
  const lines = source.split("\n");
  const range = metadataLines(lines);
  if (!range) return null;
  return {
    before: lines.slice(0, range.start),
    metadata: lines.slice(range.start, range.end + 1).join("\n"),
    after: lines.slice(range.end + 1),
    oneLine: range.start === range.end,
  };
}

/**
 * A page's text without its date — what a reader sees change. The
 * metadata export is compared without its spacing and commas, so
 * re-wrapping it or adding the date to it is no change of text.
 *
 * @param {string} source - The page's MDX source
 * @returns {string} The text to compare
 */
export function pageText(source) {
  const page = splitPage(source);
  if (!page) return source;
  const metadata = page.metadata.replace(UPDATED, "").replace(/[\s,]+/g, "");
  return [...page.before, metadata, ...page.after].join("\n");
}

/**
 * The date a page's metadata writes.
 *
 * @param {string} source - The page's MDX source
 * @returns {string | undefined} The date as written, or `undefined` when it writes none
 */
export function pageDate(source) {
  const page = splitPage(source);
  return page ? UPDATED.exec(page.metadata)?.[1] : undefined;
}

/**
 * Whether a value names a day of the calendar as `YYYY-MM-DD`.
 *
 * @param {unknown} value - The value
 * @returns {boolean} Whether it does
 */
export function isPageDate(value) {
  const parts = typeof value === "string" ? PAGE_DATE.exec(value) : null;
  if (!parts) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return day.getUTCDate() === Number(parts[3]) && day.getUTCMonth() + 1 === Number(parts[2]);
}

/**
 * A day some days before or after another.
 *
 * @param {string} date - The day, `YYYY-MM-DD`
 * @param {number} days - How many days later; earlier when negative
 * @returns {string} The day, `YYYY-MM-DD`
 */
export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/**
 * What is wrong with a page's date, given the day its text last changed.
 * A day's slack either way lets a date be written in any time zone.
 *
 * @param {string | undefined} updated - The date the page writes
 * @param {string} changedOn - The day its text last changed, `YYYY-MM-DD`
 * @param {string} today - Today, `YYYY-MM-DD`
 * @returns {string | null} The problem, or `null` when the date is right
 */
export function dateProblem(updated, changedOn, today) {
  if (!isPageDate(updated)) return 'writes no updated date as "YYYY-MM-DD"';
  if (updated < shiftDate(changedOn, -1)) {
    return `says updated: "${updated}", but its text changed on ${changedOn}`;
  }
  if (updated > shiftDate(today, 1)) return `says updated: "${updated}", a day still to come`;
  return null;
}

/**
 * A page with its date set: the date it writes replaced, or one added as
 * the metadata export's last field.
 *
 * @param {string} source - The page's MDX source
 * @param {string} date - The date, `YYYY-MM-DD`
 * @returns {string} The page
 */
export function withPageDate(source, date) {
  const page = splitPage(source);
  if (!page) return source;
  const dated = UPDATED.test(page.metadata)
    ? page.metadata.replace(UPDATED, `updated: "${date}"`)
    : page.oneLine
      ? page.metadata.replace(/,?\s*}\s*$/, `, updated: "${date}" }`)
      : page.metadata.replace(/,?\n}\s*$/, `,\n  updated: "${date}",\n}`);
  return [...page.before, dated, ...page.after].join("\n");
}
