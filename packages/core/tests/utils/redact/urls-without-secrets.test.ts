/**
 * A text with each address in it cut, and a `user:password@` written
 * before a host without a scheme — which a Windows path, its drive's colon
 * no user's, is not.
 */
import { describe, expect, it } from "vitest";

import { urlsWithoutSecrets } from "../../../src/utils/redact/urls-without-secrets";

/* A path as Windows writes it: its folders apart by backslashes. */
const windows = (path: string): string => path.replaceAll("/", "\\");

/* A scoped package's file in a project on drive D:, as an error on Windows names it. */
const SCOPED = windows("D:/a/shop/node_modules/@noverax/courier-mock/index.js");

describe("the addresses in a text", () => {
  it("are cut where they stand, the words around them kept", () => {
    expect(urlsWithoutSecrets("GET https://ana:pw@api.test/v1?sig=abc123 failed (retrying)")).toBe(
      "GET https://api.test/v1?sig=[redacted] failed (retrying)",
    );
  });

  it("include a user and password written before a host with no scheme", () => {
    expect(urlsWithoutSecrets("connect to ana:hunter2@db.internal:5432 refused")).toBe(
      "connect to [redacted]@db.internal:5432 refused",
    );
  });

  it("leave a text with no address as it was", () => {
    expect(urlsWithoutSecrets("Token expired: sign in again")).toBe("Token expired: sign in again");
  });
});

describe("a Windows path in a text", () => {
  it.each([
    ["a scoped package's file", `Cannot find module '${SCOPED}'`],
    [
      "a folder pnpm names by its version",
      windows("D:/a/shop/node_modules/.pnpm/hono@4.6.0/node_modules/hono/dist/cjs/index.js"),
    ],
    ["a stack frame", `    at Object.<anonymous> (${SCOPED}:3:7)`],
    [
      "a long path",
      `npm error path ${windows("//?/D:/a/shop/node_modules/@noverax/courier-mock")}`,
    ],
    ["JSON", JSON.stringify({ path: SCOPED })],
    [
      "an option's value",
      `npm error --prefix=${windows("D:/a/shop/node_modules/@noverax/courier-mock")} failed`,
    ],
    [
      "a file: specifier",
      `Could not install from "file:${windows("D:/a/packages/@noverax/courier-mock")}"`,
    ],
    [
      "a list of paths, a drive in lower case",
      `NODE_PATH=${windows("C:/a/node_modules")};${windows("d:/b/node_modules/@noverax/courier-mock")}`,
    ],
  ])("is kept as it is: %s", (_kind, text) => {
    expect(urlsWithoutSecrets(text)).toBe(text);
  });

  it("is no part of a user and password beside it, which are cut", () => {
    expect(urlsWithoutSecrets(`${windows("D:/a/shop/bin")};ana:hunter2@db.internal`)).toBe(
      `${windows("D:/a/shop/bin")};[redacted]@db.internal`,
    );
    expect(urlsWithoutSecrets(`${SCOPED} could not reach ana:hunter2@db.internal:5432`)).toBe(
      `${SCOPED} could not reach [redacted]@db.internal:5432`,
    );
  });

  it("leaves an address beside it without its user and password", () => {
    expect(urlsWithoutSecrets(`postgres://app:hunter2@db.internal/app refused for ${SCOPED}`)).toBe(
      `postgres://db.internal/app refused for ${SCOPED}`,
    );
    expect(urlsWithoutSecrets(`GET https://ana:pw@api.test/v1 from ${SCOPED} failed`)).toBe(
      `GET https://api.test/v1 from ${SCOPED} failed`,
    );
  });
});

describe("a user and password whose colon is no drive's", () => {
  it.each([
    [
      "a Windows domain's user",
      "tunnel through CORP\\ana:hunter2@proxy.corp:8080 refused",
      "tunnel through [redacted]@proxy.corp:8080 refused",
    ],
    [
      "a password with a backslash",
      "connect to ana:hun\\ter2@db.internal refused",
      "connect to [redacted]@db.internal refused",
    ],
    [
      "a password that starts with one",
      "connect to ana:\\hunter2@db.internal refused",
      "connect to [redacted]@db.internal refused",
    ],
    [
      "a user of one letter",
      "connect to a:hunter2@db.internal refused",
      "connect to [redacted]@db.internal refused",
    ],
  ])("is cut: %s", (_kind, text, cut) => {
    expect(urlsWithoutSecrets(text)).toBe(cut);
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

  /* A drive's colon ends a user or a password where it stands; any other colon a letter leads is
     looked past, each time a run starts before it. */
  it.each([
    ["drives that never reach a host", "(D:\\x".repeat(24_000)],
    ["passwords a drive's colon ends", " ana:x;D:\\x".repeat(10_000)],
    ["colons a lone letter leads", "(a:".repeat(40_000)],
  ])("reads %s in tens of milliseconds", (_kind, text) => {
    expect(fastest(() => urlsWithoutSecrets(text))).toBeLessThan(200);
  });
});
