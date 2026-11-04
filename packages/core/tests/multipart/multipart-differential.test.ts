/**
 * The streaming multipart parser held to two references. Bodies a real
 * encoder wrote — the platform's and Courier's own — read as the platform's
 * own parser reads them. And any body at all, well formed or broken by
 * random changes, read as the same rules applied to the whole body in one
 * buffer read it, however the body is cut into chunks. Each case runs from
 * a seed the failure names, so it can be run again.
 */
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
} from "../helpers/multipart-corpus";
import { chunked, type ReadPart, readParts, seededRandom } from "../helpers/multipart-fixtures";
import { modelParts } from "../helpers/multipart-model";

const SEED = 0x5eed_c0de;

type Outcome = { parts: Array<Omit<ReadPart, "bytes"> & { bytes: string }> } | { refused: string };

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
  it("reads every well-formed body as the platform's parser reads it, however it is cut", async () => {
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
  });
});

describe("the multipart parser against its rules over the whole body", () => {
  it("reads any body, broken or not, as the whole-body reading does, cut anywhere", async () => {
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
  });
});
