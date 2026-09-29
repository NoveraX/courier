/**
 * The mock wizard declares mocks through Studio's declare routes only: a
 * preview that changes nothing and an apply of exactly the change
 * previewed. An answer that is not the contract is refused as a whole.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({ post }));

import { declareClient } from "../src/views/mocks/wizard/declare-client";

const MOCKS = [{ key: "apiMock", source: "api", port: null, seedCount: 20, autoStart: true }];
const READY = {
  status: "ready",
  target: "courier.mocks.ts",
  creates: false,
  baseHash: "a".repeat(64),
  planDigest: "b".repeat(64),
  hunks: [
    {
      lines: [
        {
          kind: "add",
          text: "  apiMock: defineMockServer({ source }),",
          oldLine: null,
          newLine: 5,
        },
      ],
    },
  ],
  warnings: [],
};

beforeEach(() => {
  post.mockReset();
});

describe("the declare client", () => {
  it("previews through Studio's declare route and writes nothing else", async () => {
    post.mockResolvedValueOnce(READY);

    await expect(declareClient.preview(MOCKS)).resolves.toEqual(READY);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]).toEqual(["/api/mocks/declare/preview", { mocks: MOCKS }]);
  });

  it("applies the declarations with the preview's hashes and nothing else", async () => {
    const applied = {
      status: "applied",
      target: "courier.mocks.ts",
      keys: ["apiMock"],
      warnings: [],
    };
    post.mockResolvedValueOnce(applied);
    const body = { mocks: MOCKS, baseHash: READY.baseHash, planDigest: READY.planDigest };

    await expect(declareClient.apply(body)).resolves.toEqual(applied);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe("/api/mocks/declare/apply");
    expect(Object.keys(post.mock.calls[0]?.[1] ?? {}).sort()).toEqual([
      "baseHash",
      "mocks",
      "planDigest",
    ]);
  });

  it("refuses an answer it cannot read rather than show part of it", async () => {
    post.mockResolvedValueOnce({ ...READY, hunks: "+ apiMock" });
    await expect(declareClient.preview(MOCKS)).rejects.toThrow("Studio's answer could not be read");

    post.mockResolvedValueOnce({ status: "applied", target: "courier.mocks.ts" });
    await expect(
      declareClient.apply({ mocks: MOCKS, baseHash: null, planDigest: READY.planDigest }),
    ).rejects.toThrow("Studio may or may not have changed the mocks file");
  });

  it("passes on the reason Studio gives for refusing a request", async () => {
    post.mockRejectedValueOnce(
      new Error("Only the Studio page in a browser can add mocks through Studio."),
    );

    await expect(declareClient.preview(MOCKS)).rejects.toThrow("Only the Studio page in a browser");
  });
});
