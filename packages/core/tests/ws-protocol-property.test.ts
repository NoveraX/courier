/**
 * The frame codec on any input: a frame encoded is decoded as JSON carries
 * it, whatever its strings hold; and whatever arrives is decoded into a
 * frame of a known type or refused with the protocol's own error, which
 * repeats at most 120 characters of what arrived.
 */
import { describe, expect, it } from "vitest";

import { decodeMessage, encodeMessage } from "../src/realtime/ws/ws-protocol";
import { FRAME_TYPES, randomFrame, randomValue } from "./helpers/random-frames";
import { seededRandom } from "./helpers/seeded-random";

describe("the frame codec", () => {
  it("decodes every frame it encodes as JSON carries it", () => {
    const random = seededRandom(0xc0dec);
    for (let round = 0; round < 3_000; round++) {
      const message = randomFrame(random);
      const encoded = encodeMessage(message);

      expect(decodeMessage(encoded)).toEqual(JSON.parse(JSON.stringify(message)));
    }
  });

  it("decodes whatever arrives into a frame of a known type, or refuses it with its own error", () => {
    const random = seededRandom(0xbadf00d);
    let decoded = 0;
    for (let round = 0; round < 3_000; round++) {
      const raw =
        random() < 0.5
          ? JSON.stringify(
              random() < 0.5
                ? randomValue(random, 3)
                : { ...randomFrame(random), type: randomValue(random, 1) },
            )
          : encodeMessage(randomFrame(random)).slice(0, Math.floor(random() * 40));
      try {
        const message = decodeMessage(raw);
        expect(FRAME_TYPES).toContain(message.type);
        decoded++;
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/^WS protocol: /);
      }
    }
    expect(decoded).toBeGreaterThan(0);
  });

  it("repeats at most 120 characters of what it could not read", () => {
    const raw = `{${"x".repeat(10_000)}`;

    expect(() => decodeMessage(raw)).toThrow(/^WS protocol: invalid JSON — \{x{119}$/);
  });
});
