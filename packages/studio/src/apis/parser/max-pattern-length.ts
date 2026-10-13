/**
 * The longest pattern Studio compiles. The longest real specifications
 * carry — a list of every country, currency or time zone — run to a few
 * kilobytes; compiling takes milliseconds a kilobyte, so a megabyte of
 * `\p{L}` took seconds of the process reading the specification, for one
 * keyword. A longer one is left out, and said so.
 */
export const MAX_PATTERN_LENGTH = 8192;
