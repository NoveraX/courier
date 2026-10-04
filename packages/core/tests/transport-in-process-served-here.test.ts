/**
 * Which streams a process runs itself and which it only calls: an executor
 * here runs what it implements, and anything else is reached as a client at
 * its upstream's address — asked to run one, the executor says so.
 */
import { describe, expect, it } from "vitest";

import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { servedHere } from "../src/transport/in-process/served-here";
import { executeDirectSSE } from "../src/transport/in-process/sse";

const { stream } = courier();

const sources = {
  api: {
    options: { groups: {} },
    feed: stream.response<number>().implement(async function* () {
      yield { data: 1 };
    }),
  },
  remote: defineApi({
    name: "remote",
    baseURL: "http://upstream.test",
    groups: {
      feed: defineGroup({
        prefix: "feed",
        endpoints: { ticks: stream.response<number>().get("ticks") },
      }),
    },
  }),
};

describe("servedHere", () => {
  it("is true for a stream this process implements", () => {
    expect(servedHere(sources, { source: "api", method: "feed" })).toBe(true);
  });

  it("is false for one it only calls at its upstream, or where there is no endpoint", () => {
    expect(servedHere(sources, { source: "remote", group: "feed", method: "ticks" })).toBe(false);
    expect(servedHere(sources, { source: "api", method: "missing" })).toBe(false);
    expect(servedHere(sources, { source: "other", method: "feed" })).toBe(false);
  });
});

describe("an in-process executor asked to run a stream this process does not serve", () => {
  it("refuses it by name, rather than calling the definition as an implementation", async () => {
    await expect(
      executeDirectSSE(sources, { source: "remote", group: "feed", method: "ticks" }),
    ).rejects.toThrow("[remote][feed][ticks] (not served by this process)");
  });
});
