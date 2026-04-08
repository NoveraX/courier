/**
 * Verifies the `.catch` wrapper on the floating `tryConnectSocket` promise
 * inside `connectStudio`. Without it, a rejection (network error, hostname
 * resolution failure, mid-handshake throw) becomes an unhandledRejection
 * on the user app process, which crashes Node 22+ by default.
 *
 * The test mocks `./socket` so `tryConnectSocket` rejects synchronously,
 * then asserts (via the `unhandledRejection` listener) that nothing leaks
 * past the catch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/connect/socket", () => ({
  tryConnectSocket: vi.fn(() => Promise.reject(new Error("connect refused"))),
}));

import { connectStudio } from "../src/connect/connect-studio";

describe("connectStudio .catch on tryConnectSocket", () => {
  let unhandled: Array<unknown>;
  let listener: (reason: unknown) => void;

  beforeEach(() => {
    unhandled = [];
    listener = (reason) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listener);
  });

  afterEach(() => {
    process.off("unhandledRejection", listener);
  });

  it("absorbs tryConnectSocket rejection without raising unhandledRejection", async () => {
    const conn = connectStudio({});

    // connectStudio is synchronous; the rejection settles on the next
    // microtask tick. Wait long enough for unhandledRejection to fire if
    // the .catch were missing.
    await new Promise((r) => setTimeout(r, 10));

    expect(conn).toBeDefined();
    expect(unhandled).toHaveLength(0);

    conn.disconnect();
  });
});
