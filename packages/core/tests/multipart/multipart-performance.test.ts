/**
 * How the multipart parser's time grows with what an uploader controls: the
 * boundary, the data and the number of parts. Each bound compares the
 * parser with itself on two inputs, so it holds on a slow machine as on a
 * fast one; each sits far below what the wrong growth would give.
 */
import { describe, expect, it } from "vitest";

import { multipartParts } from "../../src/adapter/multipart/multipart-parts";
import { chunked, concat, ROOMY } from "../helpers/multipart-fixtures";

/* Each run's shortest of five, the two taken in turn so that the rest of a busy machine slows both alike. */
async function fastestOfEach(
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
): Promise<[number, number]> {
  let best: [number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  for (let round = 0; round < 5; round++) {
    const started = performance.now();
    await first();
    const between = performance.now();
    await second();
    best = [Math.min(best[0], between - started), Math.min(best[1], performance.now() - between)];
  }
  return best;
}

/* Several megabytes parsed ten times over take a second alone, longer beside the rest of the suite. */
const TIMED = { timeout: 60_000 };

async function drain(
  body: Uint8Array<ArrayBuffer>,
  boundary: string,
  maxParts: number,
): Promise<number> {
  const { stream } = chunked(
    body,
    Array.from({ length: body.length >> 16 }, (_, at) => at << 16),
  );
  let parts = 0;
  for await (const part of multipartParts(stream, boundary, { ...ROOMY, maxParts })) {
    parts += 1;
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

      const [shortTime, longTime] = await fastestOfEach(
        () => drain(shortBody, short, 1),
        () => drain(longBody, long, 1),
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
    /* Large enough that neither run is over in the few milliseconds a busy machine takes from it. */
    const few = form(5_000);
    const many = form(50_000);

    const [smallTime, largeTime] = await fastestOfEach(
      () => drain(few, boundary, 50_000),
      () => drain(many, boundary, 50_000),
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

    const [shortTime, longTime] = await fastestOfEach(
      () => drain(short, boundary, 200),
      () => drain(long, boundary, 200),
    );

    /* Eight times the run takes about eight times as long; a strip tried again at every blank of it would take sixty-four. */
    expect(longTime / shortTime, `${shortTime} ms, ${longTime} ms`).toBeLessThan(24);
  });
});
