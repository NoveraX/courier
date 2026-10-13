/**
 * An update check reads the specification a URL answered with in a thread
 * that hashes it: the check compares the hash, so a specification that did
 * not change needs none of it sent across, however large. The specification
 * itself is refused only when it is asked for and too large to send on.
 */
import { describe, expect, it } from "vitest";

import { computeSpecHash } from "../src/apis";
import { readFetchedSpec } from "../src/server/read-fetched-spec";
import { SpecTooLargeError } from "../src/server/spec-too-large-error";
import { SpecUnreadableError } from "../src/server/spec-unreadable-error";

const URL_OF_SPEC = "https://pets.example/api/openapi.json";
const PETS = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Pets", version: "1" },
  servers: [{ url: "/v2" }],
  paths: {
    "/pets": { get: { operationId: "listPets", responses: { "200": { description: "ok" } } } },
  },
});

function failureOf(running: Promise<unknown>): Promise<unknown> {
  return running.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("readFetchedSpec", () => {
  it("hashes the specification as Studio hashed the one it was sent", async () => {
    const read = await readFetchedSpec(URL_OF_SPEC, PETS);

    expect(read.hash).toBe(computeSpecHash(read.spec()));
    expect(read.spec()).toMatchObject({ title: "Pets", baseURL: "https://pets.example/v2" });
  });

  it("hashes a specification too large to send on, and refuses only the specification itself", async () => {
    const whole = await readFetchedSpec(URL_OF_SPEC, PETS);

    const read = await readFetchedSpec(URL_OF_SPEC, PETS, { maxBytes: 64 });

    expect(read.hash).toBe(whole.hash);
    expect(() => read.spec()).toThrow(SpecTooLargeError);
  });

  it("hashes a specification it is asked for the hash of alone", async () => {
    const whole = await readFetchedSpec(URL_OF_SPEC, PETS);

    expect((await readFetchedSpec(URL_OF_SPEC, PETS, { maxBytes: 0 })).hash).toBe(whole.hash);
  });

  it("reports an answer that is no specification as the host's failure", async () => {
    const failure = await failureOf(
      readFetchedSpec(URL_OF_SPEC, "<!doctype html><title>x</title>"),
    );

    expect(failure).toBeInstanceOf(SpecUnreadableError);
    expect(failure).toMatchObject({ httpStatus: 502 });
  });

  it("does not read for a caller already gone", async () => {
    const caller = new AbortController();
    caller.abort(new Error("gone"));

    expect(
      await failureOf(readFetchedSpec(URL_OF_SPEC, PETS, { signal: caller.signal })),
    ).toMatchObject({ message: "gone" });
  });
});
