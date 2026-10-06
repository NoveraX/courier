/**
 * A random UUID wherever a client runs: from `crypto.randomUUID`, from
 * `crypto.getRandomValues` where only that is offered, and from
 * `Math.random` where there is no crypto at all — React Native's case.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { randomId } from "../src/utils/random-id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("randomId", () => {
  it("is crypto.randomUUID's where the runtime has it", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "1b4e28ba-2fa1-41d2-883f-0016d3cca427" });

    expect(randomId()).toBe("1b4e28ba-2fa1-41d2-883f-0016d3cca427");
  });

  it("is a version 4 UUID made from getRandomValues where randomUUID is missing", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(0xff));
    vi.stubGlobal("crypto", { getRandomValues });

    const id = randomId();

    expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("is a version 4 UUID, a different one each time, where there is no crypto", () => {
    vi.stubGlobal("crypto", undefined);

    const ids = Array.from({ length: 100 }, randomId);

    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(100);
  });
});
