/**
 * An error told by what it is, whichever realm made it: Node's fetch, its
 * AbortSignal and structuredClone make theirs of the main context's `Error`
 * where a test file runs in a context of its own, as Jest runs every one,
 * and a context made with `node:vm` makes its own.
 */
import { type AddressInfo, createServer } from "node:net";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { isError, isErrorNamed } from "../../src/utils/is-error";

/* A port a server has just let go of: a connection there is refused. */
async function freedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function fetchFailure(): Promise<unknown> {
  return fetch(`http://127.0.0.1:${await freedPort()}`).then(
    () => {
      throw new Error("it did not fail");
    },
    (error: unknown) => error,
  );
}

describe("isError", () => {
  it.each([
    ["fetch's TypeError", () => fetchFailure()],
    ["the system's error under it", async () => Reflect.get(Object(await fetchFailure()), "cause")],
    ["an AbortSignal's DOMException", () => AbortSignal.abort().reason],
    [
      "structuredClone's DataCloneError",
      () => {
        try {
          return structuredClone(() => 1);
        } catch (error) {
          return error;
        }
      },
    ],
    [
      "an AggregateError of another context",
      () => runInNewContext("new AggregateError([new Error('a')], 'both')"),
    ],
  ])("tells %s for an error", async (_kind, made: () => unknown) => {
    expect(isError(await made())).toBe(true);
  });

  it("tells a record that only looks like one for none", () => {
    expect(isError({ name: "TypeError", message: "fetch failed" })).toBe(false);
  });

  it("tells a native error's kind by its name, whichever context made it", () => {
    const aggregate: unknown = runInNewContext("new AggregateError([new Error('a')], 'both')");
    const type: unknown = runInNewContext("new TypeError('t')");

    expect(isErrorNamed(aggregate, "AggregateError")).toBe(true);
    expect(isErrorNamed(type, "TypeError")).toBe(true);
    expect(isErrorNamed(type, "AggregateError")).toBe(false);
  });
});
