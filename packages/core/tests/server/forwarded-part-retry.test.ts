/**
 * The reading of a request's chain of addresses, which the server's session
 * loads with the first call that needs it, is asked for again by the next
 * call when the load failed.
 */
import { describe, expect, it, vi } from "vitest";

import { SERVER_SESSION } from "../../src/server/session/session-capability";

let loads = 0;
vi.mock("../../src/utils/forwarded-for", async (importOriginal) => {
  loads += 1;
  if (loads === 1) throw new Error("the reading of addresses did not load");
  return importOriginal();
});

describe("the server's reading of a request's addresses, failed to load once", () => {
  it("loads again for the next call", async () => {
    const request = new Request("https://app.example.com/", {
      headers: { "x-forwarded-for": "198.51.100.7" },
    });

    await expect(SERVER_SESSION.forwardedFor(request)).rejects.toThrow();
    await SERVER_SESSION.forwardedFor(request);

    expect(loads).toBe(2);
  });
});
