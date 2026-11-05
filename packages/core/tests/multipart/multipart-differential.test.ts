/**
 * The streaming multipart parser held to its references. Bodies a real
 * encoder wrote — the platform's and Courier's own — read as the platform's
 * own parser reads them, and as @remix-run/multipart-parser does; a broken
 * one read as it does wherever both take it. And any body at all, well
 * formed or broken by random changes, read as the same rules applied to the
 * whole body in one buffer read it, however the body is cut into chunks.
 * Where the references part ways, `multipart-references.test.ts` says which
 * reading is right, and why. Each case runs from a seed the failure names,
 * so it can be run again.
 */
import { MultipartParseError } from "@remix-run/multipart-parser";
import { describe, expect, it } from "vitest";

import { BodyError } from "../../src/adapter/body-error";
import { boundaryOf } from "../../src/adapter/multipart/boundary-of";
import {
  asEntries,
  encodedByCourier,
  encodedByPlatform,
  latin1,
  mutated,
  platformEntries,
  randomCuts,
  randomForm,
  remixParts,
} from "../helpers/multipart-corpus";
import { chunked, type ReadPart, readParts } from "../helpers/multipart-fixtures";
import { modelParts } from "../helpers/multipart-model";
import { seededRandom } from "../helpers/seeded-random";

const SEED = 0x5eed_c0de;
/* Thousands of bodies take a second alone and several beside the rest of the suite, slower on a busy runner. */
const MANY_BODIES = { timeout: 60_000 };

type Outcome = { parts: Array<Omit<ReadPart, "bytes"> & { bytes: string }> } | { refused: string };

/* Courier reads a quoted name or filename as the HTML standard writes one; @remix-run/multipart-parser
   reads it as MIME's quoted-string, keeping the HTML escapes and taking a backslash for the escape
   of the character after it. Which is right, multipart-references.test.ts says. Written back as it
   was sent, then read MIME's way, Courier's reading is @remix-run's. */
const HTML_ESCAPES: Readonly<Record<string, string>> = { "\n": "%0A", "\r": "%0D", '"': "%22" };
const readMimeWay = (text: string): string =>
  text.replace(/[\n\r"]/g, (char) => HTML_ESCAPES[char] ?? char).replace(/\\(.)/gs, "$1");

/* Parts as two parsers' readings compare. */
const asRead = (parts: ReadPart[]) =>
  parts.map((part) => ({
    name: part.name,
    filename: part.filename,
    type: part.type,
    bytes: latin1(part.bytes),
  }));

/* Courier's parts as @remix-run/multipart-parser reads their names. */
const asRemixReads = (parts: ReadPart[]) =>
  asRead(parts).map((part) => ({
    ...part,
    name: readMimeWay(part.name),
    filename: part.filename === undefined ? undefined : readMimeWay(part.filename),
  }));

/* A refusal is compared by its code; anything else a parser throws fails the test. */
async function outcomeOf(read: () => ReadPart[] | Promise<ReadPart[]>): Promise<Outcome> {
  try {
    return { parts: (await read()).map((part) => ({ ...part, bytes: latin1(part.bytes) })) };
  } catch (error) {
    if (error instanceof BodyError) return { refused: error.code };
    throw error;
  }
}

describe("the multipart parser against the platform's own", () => {
  it(
    "reads every well-formed body as the platform's parser reads it, however it is cut",
    MANY_BODIES,
    async () => {
      for (let run = 0; run < 300; run++) {
        const random = seededRandom(SEED + run);
        const form = randomForm(random);
        for (const encode of [encodedByPlatform, encodedByCourier]) {
          const { body, contentType } = await encode(form);
          const expected = await platformEntries(body, contentType);
          const { stream } = chunked(body, randomCuts(random, body.length));

          const parts = await readParts(stream, boundaryOf(contentType));

          expect(asEntries(parts), `seed ${SEED + run}, ${encode.name}`).toEqual(expected);
        }
      }
    },
  );
});

describe("the multipart parser against @remix-run/multipart-parser", () => {
  it("reads every well-formed body as it does, however it is cut", MANY_BODIES, async () => {
    for (let run = 0; run < 300; run++) {
      const random = seededRandom(SEED + 20_000 + run);
      const form = randomForm(random);
      for (const encode of [encodedByPlatform, encodedByCourier]) {
        const { body, contentType } = await encode(form);
        const boundary = boundaryOf(contentType);
        const { stream } = chunked(body, randomCuts(random, body.length));

        const parts = await readParts(stream, boundary);

        expect(asRemixReads(parts), `seed ${SEED + 20_000 + run}, ${encode.name}`).toEqual(
          asRead(remixParts(body, boundary)),
        );
      }
    }
  });

  it("reads a broken body as it does wherever both take it", MANY_BODIES, async () => {
    let both = 0;
    for (let run = 0; run < 1000; run++) {
      const seed = SEED + 30_000 + run;
      const random = seededRandom(seed);
      const encode = random() < 0.5 ? encodedByPlatform : encodedByCourier;
      const { body: whole, contentType } = await encode(randomForm(random));
      const boundary = boundaryOf(contentType);
      const body = mutated(random, whole, boundary);
      let ours: ReadPart[];
      try {
        ours = await readParts(chunked(body, randomCuts(random, body.length)).stream, boundary);
      } catch (error) {
        if (error instanceof BodyError) continue;
        throw error;
      }
      let theirs: ReadPart[];
      try {
        theirs = remixParts(body, boundary);
      } catch (error) {
        /* A body it does not read throws its own error; a header that is not UTF-8, the decoder's. */
        if (error instanceof MultipartParseError || error instanceof TypeError) continue;
        throw error;
      }
      both += 1;

      expect(asRemixReads(ours), `seed ${seed}`).toEqual(asRead(theirs));
    }
    /* Most broken bodies still parse: the comparison is made, not passed over. */
    expect(both).toBeGreaterThan(300);
  });
});

describe("the multipart parser against its rules over the whole body", () => {
  it(
    "reads any body, broken or not, as the whole-body reading does, cut anywhere",
    MANY_BODIES,
    async () => {
      for (let run = 0; run < 2000; run++) {
        const seed = SEED + 10_000 + run;
        const random = seededRandom(seed);
        const encode = random() < 0.5 ? encodedByPlatform : encodedByCourier;
        const { body: whole, contentType } = await encode(randomForm(random));
        const boundary = boundaryOf(contentType);
        const body = random() < 0.8 ? mutated(random, whole, boundary) : whole;
        const limits = {
          maxParts: 1 + Math.floor(random() * 12),
          maxHeaderBytes: 48 + Math.floor(random() * 400),
        };

        const expected = await outcomeOf(() => modelParts(body, boundary, limits));
        const actual = await outcomeOf(() =>
          readParts(chunked(body, randomCuts(random, body.length)).stream, boundary, limits),
        );

        expect(actual, `seed ${seed}`).toEqual(expected);
      }
    },
  );
});

/* A text's 32-bit FNV-1a digest, which a corpus is pinned by. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

describe("the corpus a seed names", () => {
  it("is drawn the same on every run, so the seed a failure prints brings its bodies back", async () => {
    const runs: unknown[] = [];
    for (let run = 0; run < 20; run++) {
      const random = seededRandom(SEED + run);
      const entries = await Promise.all(
        [...randomForm(random)].map(async ([name, value]) =>
          typeof value === "string"
            ? [name, value]
            : [
                name,
                {
                  name: value.name,
                  type: value.type,
                  bytes: latin1(new Uint8Array(await value.arrayBuffer())),
                },
              ],
        ),
      );
      runs.push({ entries, cuts: randomCuts(random, 2000) });
    }
    const first = seededRandom(SEED);

    expect(Array.from({ length: 4 }, () => first())).toEqual([
      0.6209077404346317, 0.5718873245641589, 0.29364756983704865, 0.6569558416958898,
    ]);
    expect(fnv1a(JSON.stringify(runs))).toBe("6fdec897");
  });
});
