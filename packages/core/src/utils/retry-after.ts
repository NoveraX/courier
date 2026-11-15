const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
const MONTH = `(?<month>${MONTHS.join("|")})`;
/* A day of the month in two digits, and a time of day up to 23:59:60, a leap second. */
const DAY = "(?<day>0[1-9]|[12]\\d|3[01])";
const TIME = "(?<hour>[01]\\d|2[0-3]):(?<minute>[0-5]\\d):(?<second>[0-5]\\d|60)";

/* delay-seconds: digits, as RFC 9110 writes them, or with a fraction, as some servers send. */
const SECONDS = /^\d+(?:\.\d+)?$/;

/* The three forms of an HTTP date RFC 9110 has a recipient accept, each in GMT. */
const HTTP_DATES = [
  /* IMF-fixdate: Sun, 06 Nov 1994 08:49:37 GMT */
  new RegExp(`^${WEEKDAY}, ${DAY} ${MONTH} (?<year>\\d{4}) ${TIME} GMT$`),
  /* RFC 850, its year in two digits: Sunday, 06-Nov-94 08:49:37 GMT */
  new RegExp(
    `^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, ${DAY}-${MONTH}-(?<year>\\d\\d) ${TIME} GMT$`,
  ),
  /* asctime, which names no zone, a day of one digit after a space: Sun Nov  6 08:49:37 1994 */
  new RegExp(`^${WEEKDAY} ${MONTH} (?<day>[ 0][1-9]|[12]\\d|3[01]) ${TIME} (?<year>\\d{4})$`),
];

/**
 * How long a `Retry-After` asks to be waited for: its seconds — whole, as
 * RFC 9110 writes them, or with a fraction, as some servers send — or the
 * time until its HTTP date, in any of the three forms RFC 9110 has a
 * recipient accept, a date already past asking for no wait. Anything else is
 * not read, a date with a field out of its range included, so the same
 * value means the same wait in every engine.
 *
 * @param value - The header's value, if the answer has one
 * @param now - The time, in ms since the epoch
 * @returns The wait in ms, never shorter than asked; `undefined` where the value is not read
 * @example
 * ```ts
 * retryAfterWait("1.5", Date.now()); // → 1500
 * retryAfterWait("Sun, 06 Nov 1994 08:49:37 GMT", Date.now()); // → 0
 * retryAfterWait("soon", Date.now()); // → undefined
 * ```
 */
export function retryAfterWait(value: string | null | undefined, now: number): number | undefined {
  const said = value ?? "";
  if (SECONDS.test(said)) return Math.ceil(Number(said) * 1000);
  const at = httpDate(said, now);
  return at === undefined ? undefined : Math.max(0, at - now);
}

/* A date of a form HTTP has, each field in its range, as its time; anything else, `undefined`. */
function httpDate(said: string, now: number): number | undefined {
  for (const form of HTTP_DATES) {
    const fields = form.exec(said)?.groups;
    if (fields !== undefined) return timeOf(fields, now);
  }
  return undefined;
}

/* The date's time, in ms since the epoch. */
function timeOf(fields: { readonly [field: string]: string }, now: number): number {
  const { year = "", month = "", day = "", hour = "", minute = "", second = "" } = fields;
  const fullYear = year.length === 2 ? nearestYear(Number(year), now) : Number(year);
  return Date.UTC(
    fullYear,
    MONTHS.indexOf(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

/* Two digits name the year nearest now that ends in them: none more than fifty years ahead,
   as RFC 9110 has a recipient read them, and none fifty or more behind. */
function nearestYear(digits: number, now: number): number {
  const thisYear = new Date(now).getUTCFullYear();
  const year = thisYear - (thisYear % 100) + digits;
  if (year > thisYear + 50) return year - 100;
  return year <= thisYear - 50 ? year + 100 : year;
}
