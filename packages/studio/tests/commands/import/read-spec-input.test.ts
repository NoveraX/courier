/**
 * What `courier-studio import` takes for an address and what for a file. An
 * address is whatever a URL parser reads as an http:// or https:// one once
 * trimmed — a space a paste left before it, `\\` or one slash for `//` —
 * and a user and a password in it are refused as Studio refuses them,
 * never said back. A path the parser reads as an address of another scheme
 * is looked for as a file, and not said back either. Values are made up.
 */
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readSpecInput } from "../../../src/commands/import/read-spec-input";
import type { ProjectReads } from "../../../src/server/project-state/types";

/* A URL on this machine is read without asking the project which private hosts it names. */
const PROJECT = {} as ProjectReads;
const ROOT = "/work/shop";
const SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Orders", version: "1" },
  paths: {},
});

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

const failureOf = (given: string) =>
  readSpecInput(given, PROJECT, ROOT).then(
    () => undefined,
    (err: unknown) => err,
  );

describe("an address given with a user and a password", () => {
  it.each([
    " https://ana:pw-made-up-77@127.0.0.1:1/openapi.json",
    "https:\\\\ana:pw-made-up-77@127.0.0.1:1/openapi.json",
  ])("is refused as one, the password never said back: %j", async (given) => {
    const refusal = await failureOf(given);

    expect(refusal).toMatchObject({ code: "SPEC_CREDENTIALS_IN_URL" });
    expect(JSON.stringify(refusal, Object.getOwnPropertyNames(refusal))).not.toContain(
      "pw-made-up-77",
    );
  });
});

describe("an address written otherwise than as one", () => {
  it("is read, and kept as the parser reads it", async () => {
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(SPEC);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    servers.push(server);
    const { port } = server.address() as { port: number };
    const address = `http://127.0.0.1:${port}/openapi.json`;

    const pasted = await readSpecInput(`  ${address}`, PROJECT, ROOT);
    const backslashes = await readSpecInput(
      `http:\\\\127.0.0.1:${port}\\openapi.json`,
      PROJECT,
      ROOT,
    );

    expect(pasted).toMatchObject({ importType: "url", url: address, raw: SPEC });
    expect(backslashes).toMatchObject({ importType: "url", url: address, raw: SPEC });
  });
});

describe("a file the command is given", () => {
  it("is not said back when the parser reads its path as an address of another scheme", async () => {
    const refusal = await failureOf("ftp://ana:pw-made-up-77@specs.example/openapi.json");

    expect(refusal).toMatchObject({
      message: "There is no file at the path given, which reads as an address",
    });
  });

  it("is named by its path otherwise, a Windows drive's included", async () => {
    for (const given of ["specs/missing-openapi.json", "C:\\specs\\missing-openapi.json"]) {
      expect(await failureOf(given)).toMatchObject({
        message: `There is no file at ${resolve(given)}`,
      });
    }
  });
});
