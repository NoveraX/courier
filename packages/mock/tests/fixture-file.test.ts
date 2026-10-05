/**
 * A mock's recordings file: a file not written yet holds no recordings, a
 * written one reads back as it was written, one that is not a HAR log of
 * Courier recordings stops the mock with its path, and the headers of a
 * request sent on to the source's server keep its credentials but none of
 * the hop's.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Fixture } from "../src/record/fixture";
import { readFixtureFile, writeFixtureFile } from "../src/record/fixture-file";
import { FixtureFileError } from "../src/record/fixture-file-error";
import { forwardedHeaders, returnedHeaders } from "../src/server/forwarded-headers";

const FIXTURE: Fixture = {
  group: "users",
  method: "get",
  variables: { id: 1 },
  request: { method: "GET", url: "http://api.example/users/1" },
  response: { status: 200, data: { id: 1 }, headers: { "x-id": "1" } },
  duration: 12,
  recordedAt: "2026-10-05T12:00:00.000Z",
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-fixture-file-"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("a mock's recordings file", () => {
  it("holds nothing before it is written, and reads back what was written", () => {
    const file = join(dir, "nested", "shop.har");

    expect(readFixtureFile(file)).toEqual([]);
    writeFixtureFile(file, [FIXTURE]);
    expect(readFixtureFile(file)).toEqual([FIXTURE]);
  });

  it("stops the mock, naming the file, when it is not a HAR log of recordings", () => {
    const file = join(dir, "broken.har");
    writeFileSync(file, '{"log":{"entries":[{"oops":true}]}}');

    expect(() => readFixtureFile(file)).toThrow(FixtureFileError);
    expect(() => readFixtureFile(file)).toThrow(file);
    writeFileSync(file, "not json");
    expect(() => readFixtureFile(file)).toThrow(FixtureFileError);
  });
});

describe("headers between the mock and the source's server", () => {
  it("sends on the request's credentials and own headers, but none of the hop's", () => {
    const sent = forwardedHeaders(
      new Headers({
        authorization: "Bearer t",
        cookie: "s=1",
        "x-tenant": "acme",
        host: "localhost:7011",
        origin: "http://localhost:3000",
        "sec-fetch-mode": "cors",
        "content-length": "2",
      }),
    );

    expect(sent).toEqual({ authorization: "Bearer t", cookie: "s=1", "x-tenant": "acme" });
  });

  it("answers with the server's headers but not those describing its bytes", () => {
    const kept = returnedHeaders(
      new Headers({
        "x-id": "1",
        "set-cookie": "s=2",
        "content-length": "9",
        "content-encoding": "gzip",
      }),
    );

    expect(kept).toEqual({ "x-id": "1", "set-cookie": "s=2" });
  });
});
