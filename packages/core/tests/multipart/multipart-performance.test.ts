/**
 * How the multipart parser's time grows with what an uploader controls: the
 * boundary, the data and the number of parts. Each bound compares the
 * parser with itself on two inputs, so it holds on a slow machine as on a
 * fast one; each sits far below what the wrong growth would give.
 */
import { describe, expect, it } from "vitest";

import { multipartParts } from "../../src/adapter/multipart/multipart-parts";
import { chunked, concat, ROOMY } from "../helpers/multipart-fixtures";

/* The shortest of five runs, the one least disturbed by the rest of the machine. */
async function fastest(run: () => Promise<void>): Promise<number> {
  let best = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 5; attempt++) {
    const started = performance.now();
    await run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

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
  it("does not grow with the boundary's length on data built to defeat the search", async () => {
    const SIZE = 4 * 1024 * 1024;
    const short = "a".repeat(10);
    const long = "a".repeat(70);
    const shortBody = adversarial(short, SIZE);
    const longBody = adversarial(long, SIZE);

    const shortTime = await fastest(async () => {
      await drain(shortBody, short, 1);
    });
    const longTime = await fastest(async () => {
      await drain(longBody, long, 1);
    });

    /* A search that compares the whole needle at each byte would take 7 times as long. */
    expect(longTime / shortTime).toBeLessThan(3);
  });

  it("grows in step with the number of parts, 10 000 of them included", async () => {
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
    const few = form(2_000);
    const many = form(20_000);

    const smallTime = await fastest(async () => {
      await drain(few, boundary, 20_000);
    });
    const largeTime = await fastest(async () => {
      await drain(many, boundary, 20_000);
    });

    /* Ten times the parts take about ten times as long; a parser that went back over earlier parts would take a hundred. */
    expect(largeTime / smallTime).toBeLessThan(30);
  });
});
