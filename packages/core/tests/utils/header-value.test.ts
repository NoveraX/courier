/**
 * A header value is refused where fetch refuses it, and nowhere else, and
 * otherwise sent as fetch sends it: refused by `Headers`, or by the
 * dispatcher that sends it, which takes no control character but a tab.
 * The platform's own `Headers` and that rule are the measure, over every
 * short value made of the characters at the rule's edges: the whitespace
 * fetch trims from the ends, the whitespace `trim()` takes besides, NUL and
 * the other control characters, the last character a byte holds and the
 * first past it. The dispatcher's refusals are checked on a real request.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../../src/errors/configuration-error";
import { sendableHeaders } from "../../src/utils/header-value";

const EDGES = [
  "a",
  "\t",
  "\n",
  "\r",
  " ",
  "\v",
  "\f",
  "\u00a0",
  "\u0085",
  "\0",
  "\u0001",
  "\u007f",
  "\u00e9",
  "\u00ff",
  "\u0100",
  "\ufeff",
  "\u2028",
  "\u3000",
  "\ud83d",
];

/* Every value of up to three edges, so each one stands before, after and between the others. */
function shortValues(): string[] {
  let values = [""];
  const all = [""];
  for (let length = 1; length <= 3; length++) {
    values = values.flatMap((value) => EDGES.map((edge) => value + edge));
    all.push(...values);
  }
  return all;
}

/* What fetch's dispatcher refuses in a value Headers took, as it sends it: a control character
   but a tab, as undici's own check reads it. */
const dispatcherRefuses = (sent: string): boolean =>
  [...sent].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 0x20 && code !== 0x09) || code === 0x7f;
  });

function byFetch(value: string): string {
  try {
    const headers = new Headers();
    headers.append("x-api-key", value);
    const sent = headers.get("x-api-key") ?? "";
    return dispatcherRefuses(sent) ? "refused" : `sent ${JSON.stringify(sent)}`;
  } catch {
    return "refused";
  }
}

function byCourier(value: string): string {
  try {
    return `sent ${JSON.stringify(sendableHeaders({ "x-api-key": value }).get("x-api-key"))}`;
  } catch (error) {
    const own = error instanceof ConfigurationError && error.code === "HEADER_VALUE_INVALID";
    return own ? "refused" : `left to the platform's refusal: ${String(error)}`;
  }
}

/* The fastest of three runs: one the machine's load or a collection held up says nothing of the reading. */
const fastest = (run: () => void): number =>
  Math.min(
    ...[0, 1, 2].map(() => {
      const started = performance.now();
      run();
      return performance.now() - started;
    }),
  );

describe("a header value", () => {
  it("is refused where fetch or its dispatcher refuses it, and otherwise sent as fetch sends it", () => {
    const differing = shortValues()
      .filter((value) => byCourier(value) !== byFetch(value))
      .map((value) => `${JSON.stringify(value)}: ${byCourier(value)}; fetch: ${byFetch(value)}`);

    expect(differing).toEqual([]);
  });

  it("is refused for a control character Headers takes and the dispatcher refuses as it sends", async () => {
    const server = createServer((_req, res) => res.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    try {
      for (const control of ["\x01", "\x0b", "\x7f"]) {
        const value = `a${control}b`;
        const headers = new Headers({ "x-api-key": value });
        await expect(fetch(`http://127.0.0.1:${port}/`, { headers })).rejects.toThrow();
        expect(byCourier(value)).toBe("refused");
      }
      await expect(
        fetch(`http://127.0.0.1:${port}/`, { headers: { "x-api-key": "a\tb\u00e9" } }),
      ).resolves.toMatchObject({ status: 200 });
    } finally {
      server.close();
    }
  });

  it("is read in one pass, however long the runs of spaces at its ends and inside it", () => {
    const run = " ".repeat(32 * 1024);
    const value = `${run}a${run}b${run}`;

    expect(sendableHeaders({ "x-note": value }).get("x-note")).toBe(`a${run}b`);
    expect(fastest(() => sendableHeaders({ "x-note": value }))).toBeLessThan(100);
  });
});
