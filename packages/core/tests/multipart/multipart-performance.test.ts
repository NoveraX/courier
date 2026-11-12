/**
 * How the multipart parser's time grows with what an uploader controls: the
 * boundary, the data and the number of parts. Each bound compares the
 * parser with itself on two inputs, so it holds on a slow machine as on a
 * fast one; each sits far below what the wrong growth would give. Each
 * counts the time the thread spent parsing, over runs of the two taken in
 * turn, so that no pause the system takes from the thread counts; the
 * larger input is parsed through such a pause, longer than the parse.
 */
import { describe, expect, it } from "vitest";

import { multipartParts } from "../../src/adapter/multipart/multipart-parts";
import { chunked, concat, ROOMY } from "../helpers/multipart-fixtures";

/* The time the test's thread spent at work, in milliseconds: neither a pause the system takes
   from it nor the suites run beside it count. */
function threadTime(): number {
  const { user, system } = process.threadCpuUsage();
  return (user + system) / 1000;
}

/* What each of two runs taken in turn spends all told, at the least: a system that counts a
   thread's time by its clock's ticks, some 16 ms apart on Windows, counts a short run as no time
   or a whole tick, and only many of them as what they took. */
const SPENT_MS = 200;

/* What each of two runs takes the thread, over runs taken in turn until each spent SPENT_MS. */
async function threadTimeOfEach(
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
): Promise<[number, number]> {
  const runs = [first, second] as const;
  const spent: [number, number] = [0, 0];
  const counted: [number, number] = [0, 0];
  while (Math.min(...spent) < SPENT_MS) {
    const at = spent[0] <= spent[1] ? 0 : 1;
    const started = threadTime();
    await runs[at]();
    spent[at] += threadTime() - started;
    counted[at] += 1;
  }
  return [spent[0] / counted[0], spent[1] / counted[1]];
}

/* Several megabytes parsed over and over, until each input spent a fifth of a second, and the
   pauses each larger one is parsed through take a few seconds alone, longer beside the rest of
   the suite. */
const TIMED = { timeout: 60_000 };

/* What a busy machine does to the test now and then: the system gives its thread to others a
   while, and the thread does nothing meanwhile. */
function pausedFor(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/* The parts of `body` read whole, the system pausing the thread `pause` ms after the first one. */
async function drain(
  body: Uint8Array<ArrayBuffer>,
  boundary: string,
  maxParts: number,
  pause = 0,
): Promise<number> {
  const { stream } = chunked(
    body,
    Array.from({ length: body.length >> 16 }, (_, at) => at << 16),
  );
  let parts = 0;
  for await (const part of multipartParts(stream, boundary, { ...ROOMY, maxParts })) {
    parts += 1;
    if (parts === 1 && pause > 0) pausedFor(pause);
    for await (const _piece of part.body);
  }
  return parts;
}

/* One file of `size` bytes, each the boundary's own last character: every window ends as the delimiter does. */
function adversarial(boundary: string, size: number): Uint8Array<ArrayBuffer> {
  return concat(
    `--${boundary}\r\nContent-Disposition: form-data; name="f"; filename="f"\r\n\r\n`,
    new Uint8Array(size).fill(boundary.charCodeAt(boundary.length - 1)),
    `\r\n--${boundary}--\r\n`,
  );
}

describe("the multipart parser's time", () => {
  it(
    "does not grow with the boundary's length on data built to defeat the search",
    TIMED,
    async () => {
      const SIZE = 4 * 1024 * 1024;
      const short = "a".repeat(10);
      const long = "a".repeat(70);
      const shortBody = adversarial(short, SIZE);
      const longBody = adversarial(long, SIZE);

      const [shortTime, longTime] = await threadTimeOfEach(
        () => drain(shortBody, short, 1),
        /* The machine is busy as the long one is parsed: the system pauses the thread longer than the parse takes, which a clock on the wall would count against the bound. */
        () => drain(longBody, long, 1, 50),
      );

      /* A search that compares the whole needle at each byte would take 7 times as long. */
      expect(longTime / shortTime, `${shortTime} ms, ${longTime} ms`).toBeLessThan(3);
    },
  );

  it("grows in step with the number of parts, 10 000 of them included", TIMED, async () => {
    const boundary = "----courier-many-parts";
    const form = (count: number): Uint8Array<ArrayBuffer> =>
      concat(
        ...Array.from(
          { length: count },
          (_, at) =>
            `--${boundary}\r\nContent-Disposition: form-data; name="p${at}"\r\n\r\nv${at}\r\n`,
        ),
        `--${boundary}--\r\n`,
      );
    expect(await drain(form(10_000), boundary, 10_000)).toBe(10_000);
    /* Large enough that what a run costs before its first part is little beside what its parts cost. */
    const few = form(5_000);
    const many = form(50_000);

    const [smallTime, largeTime] = await threadTimeOfEach(
      () => drain(few, boundary, 50_000),
      /* The machine is busy as the many are parsed: the system pauses the thread longer than the parse takes, which a clock on the wall would count against the bound. */
      () => drain(many, boundary, 50_000, 400),
    );

    /* Ten times the parts take about ten times as long; a parser that went back over earlier parts would take a hundred. */
    expect(largeTime / smallTime, `${smallTime} ms, ${largeTime} ms`).toBeLessThan(30);
  });

  it("grows in step with a run of spaces and tabs inside a part's header", TIMED, async () => {
    const boundary = "----courier-blank-runs";
    /* Two hundred parts, each with a type that holds one run of blanks inside it. */
    const form = (run: number): Uint8Array<ArrayBuffer> =>
      concat(
        ...Array.from(
          { length: 200 },
          (_, at) =>
            `--${boundary}\r\nContent-Disposition: form-data; name="p${at}"\r\n` +
            `Content-Type: text/plain;${" \t".repeat(run / 2)}charset=utf-8\r\n\r\nv\r\n`,
        ),
        `--${boundary}--\r\n`,
      );
    const short = form(1_000);
    /* As long as the lines of a part's headers may be together. */
    const long = form(8_000);

    const [shortTime, longTime] = await threadTimeOfEach(
      () => drain(short, boundary, 200),
      /* The machine is busy as the long runs are parsed: the system pauses the thread longer than the parse takes, which a clock on the wall would count against the bound. */
      () => drain(long, boundary, 200, 50),
    );

    /* Eight times the run takes about eight times as long; a strip tried again at every blank of it would take sixty-four. */
    expect(longTime / shortTime, `${shortTime} ms, ${longTime} ms`).toBeLessThan(24);
  });
});
