/**
 * An address no single word holds: the one the platform quotes, to the end
 * of its line, when it refuses an address with credentials or cannot parse
 * one, and a user and password that a quote, a space or a bracket splits.
 * Its credentials are cut whole; prose that only runs from an address to
 * an e-mail address is left as it was.
 */
import { describe, expect, it } from "vitest";

import { splitUrlsWithoutSecrets } from "../../src/secrets/split-urls-without-secrets";

const REFUSED = "Request cannot be constructed from a URL that includes credentials: ";
const UNPARSED = "Failed to parse URL from ";

describe("an address the platform quotes as it refuses it", () => {
  it.each([
    ["a quote", "http://ana:pa55'w0rd@127.0.0.1:4010/v4/user/42/hosts"],
    ["a double quote", 'http://ana:pa55"w0rd@127.0.0.1:4010/v4/user/42/hosts'],
    ["a space", "http://ana:pa55 w0rd@127.0.0.1:4010/v4/user/42/hosts"],
    ["nothing", "http://ana:pa55w0rd@127.0.0.1:4010/v4/user/42/hosts?key=k3y"],
  ])("is cut to its origin when its password holds %s", (_, address) => {
    expect(splitUrlsWithoutSecrets(`${REFUSED}${address}`)).toBe(`${REFUSED}http://127.0.0.1:4010`);
  });

  it("is cut to the end of its line, and the lines after it are kept", () => {
    expect(
      splitUrlsWithoutSecrets(
        `Sign-in failed: ${REFUSED}http://ana:pa55 w0rd@api.test/v1\nRetrying`,
      ),
    ).toBe(`Sign-in failed: ${REFUSED}http://api.test\nRetrying`);
  });

  it("is cut whole, as a marker, when it cannot be read as an address", () => {
    expect(
      splitUrlsWithoutSecrets(`${UNPARSED}http://ana:pa55 w0rd@api.example.com:99999/v4`),
    ).toBe(`${UNPARSED}[redacted]`);
    expect(splitUrlsWithoutSecrets(`${UNPARSED}//ana:pa55w0rd@api.test/v4`)).toBe(
      `${UNPARSED}[redacted]`,
    );
    expect(splitUrlsWithoutSecrets(`${UNPARSED}t0k3n@api.test/v4`)).toBe(`${UNPARSED}[redacted]`);
  });

  it("keeps a path with no host, which holds no user nor password", () => {
    for (const path of ["/api/users", "/api/users?page=2", "api.example.com/v1/users"]) {
      expect(splitUrlsWithoutSecrets(`${UNPARSED}${path}`)).toBe(`${UNPARSED}${path}`);
    }
  });
});

describe("a user and password a quote, a space or a bracket splits", () => {
  it.each([
    ["a quote", "pa55'w0rd"],
    ["a double quote", 'pa55"w0rd'],
    ["a space", "pa55 w0rd"],
    ["brackets", "pa55(w0rd)"],
    ["a backtick", "pa55`w0rd"],
    ["an at sign and a quote", "pa@55'w0rd"],
    ["a backslash and a space", "pa55\\ w0rd"],
  ])("is cut to the last @ before the address's path when the password holds %s", (_, password) => {
    expect(
      splitUrlsWithoutSecrets(`connect to postgres://app:${password}@db.internal:5432/app`),
    ).toBe("connect to postgres://db.internal:5432/app");
  });

  it("is cut where the address has no path, to the end of its line", () => {
    expect(splitUrlsWithoutSecrets("redis://:pa55 w0rd@localhost:6379 refused\nnext")).toBe(
      "redis://localhost:6379 refused\nnext",
    );
  });
});

describe("what is left as it was", () => {
  it.each([
    "GET https://api.example.com failed for ana@example.test",
    "Sync to https://api.example.com:8443 failed for ana@example.test",
    '{"webhook":"http://localhost:3000","owner":"ana@example.test"}',
    "(see http://localhost:3000) and write to ana@example.test",
    "GET http://[::1]:3000 failed for ana@example.test",
    "GET http://api.test\\v1 failed for ana@example.test",
    "GET https://ana:pw@api.test/v1 failed",
    "GET https://api.example.com/v1/packages/@noverax/courier failed",
    "Token expired: sign in again",
  ])("%s", (text) => {
    expect(splitUrlsWithoutSecrets(text)).toBe(text);
  });
});

describe("a text of any size", () => {
  /* The fastest of three runs: one the machine's load or a collection held up says nothing of the reading. */
  const fastest = (run: () => void): number =>
    Math.min(
      ...[0, 1, 2].map(() => {
        const started = performance.now();
        run();
        return performance.now() - started;
      }),
    );

  it.each([
    ["addresses that never reach a path", "a://b:c d ".repeat(100_000)],
    ["addresses with an at sign in each", "a://b:c d@e ".repeat(100_000)],
    ["refusals that never end a line", REFUSED.repeat(20_000)],
    ["one long line", `x://${"y".repeat(1_000_000)}`],
  ])("reads %s once", (_, text) => {
    expect(fastest(() => splitUrlsWithoutSecrets(text))).toBeLessThan(200);
  });
});
