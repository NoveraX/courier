import { BYTE_ORDER_MARK } from "./plan/byte-order-mark";

/** A run of a text, in UTF-16 offsets: `start` inclusive, `end` exclusive. */
export interface TextSpan {
  start: number;
  end: number;
}

const MAX_SHOWN_LENGTH = 200;
/* Between two runs of one line that are not next to each other. */
const GAP = " … ";

function visible(text: string, { start, end }: TextSpan): string {
  const skip = start === 0 && text.startsWith(BYTE_ORDER_MARK) ? 1 : 0;
  return text.slice(start + skip, end).replaceAll("\r", "");
}

function merged(spans: readonly TextSpan[]): TextSpan[] {
  const runs: TextSpan[] = [];
  for (const span of spans) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.end === span.start) last.end = span.end;
    else runs.push({ ...span });
  }
  return runs;
}

function truncate(text: string): string {
  if (text.length <= MAX_SHOWN_LENGTH) return text;
  let cut = MAX_SHOWN_LENGTH - 1;
  const last = text.charCodeAt(cut - 1);
  /* A cut between the halves of a surrogate pair would leave half a character. */
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return `${text.slice(0, cut)}…`;
}

/**
 * Runs of a text as a diff shows them: without a byte order mark at the
 * start of the file, without carriage returns, runs that are not adjacent
 * joined by ` … `, and at most 200 characters, the last of them `…` when
 * longer. A whole line is one run, from its start to its content's end.
 *
 * @param text - The whole text.
 * @param spans - The runs to show, in text order.
 * @returns The runs' text for display.
 * @example
 * shownText("\uFEFFa\r\n", [{ start: 0, end: 2 }]); // "a"
 * shownText("f(a, x, b, y)", [{ start: 3, end: 6 }, { start: 9, end: 12 }]); // ", x … , y"
 */
export function shownText(text: string, spans: readonly TextSpan[]): string {
  return truncate(
    merged(spans)
      .map((span) => visible(text, span))
      .join(GAP),
  );
}
