/**
 * The id a Playground run's request is shown under, which the runtime runs
 * the call under and the Playground looks the request up by.
 */
import { describe, expect, it } from "vitest";

import { playgroundRequestId } from "../src/lib/playground-request-id";

/* What Courier's proxy adopts from the request header that names an id. */
const ADOPTED = /^[A-Za-z0-9_-]{8,64}$/;

describe("the request id of a Playground run", () => {
  it("is the run's id behind a prefix of its own", () => {
    expect(playgroundRequestId("dcd67e67-ce4e-4940-8f3d-34f6b873bf90")).toBe(
      "pg_dcd67e67-ce4e-4940-8f3d-34f6b873bf90",
    );
  });

  it("keeps only what a request id may hold, so the proxy adopts it", () => {
    const id = playgroundRequestId("run 1/two:three");

    expect(id).toBe("pg_run1twothree");
    expect(id).toMatch(ADOPTED);
  });

  it("is never longer than the proxy adopts", () => {
    expect(playgroundRequestId("x".repeat(200))).toHaveLength(64);
  });
});
