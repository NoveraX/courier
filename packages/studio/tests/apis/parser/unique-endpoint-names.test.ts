/**
 * Endpoint names a group or a source cannot hold, and the OPTIONS verb,
 * checked by calling the generated client against a real server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedCall, loadGenerated } from "../../helpers/load-generated";
import { type RecordingServer, startRecordingServer } from "../../helpers/recording-server";

const GROUPINGS = ["tag", "path", "single"] as const;

let server: RecordingServer;

beforeAll(async () => {
  server = await startRecordingServer(() => ({ contentType: "application/json", body: "{}" }));
});

afterAll(async () => {
  await server.close();
});

const ok = { responses: { "200": { description: "ok" } } };

function spec(): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Settings", version: "1" },
    servers: [{ url: `${server.url}/v1` }],
    paths: {
      "/settings/options": { get: { tags: ["settings"], operationId: "options", ...ok } },
      "/settings/list": { get: { tags: ["settings"], operationId: "list", ...ok } },
      "/settings": { options: { tags: ["settings"], ...ok } },
    },
  });
}

function call(groupBy: (typeof GROUPINGS)[number], name: string) {
  const files = generateCode(parseSpec(spec()), { type: "openapi", outputDir: "src", groupBy }, "prefs");
  const group = groupBy === "single" ? [] : ["settings"];
  return generatedCall(loadGenerated(files, "src/prefs/index.ts"), ["prefsApi", ...group, name]);
}

describe.each(GROUPINGS)("an operation named options (%s)", (groupBy) => {
  it("is generated under a name of its own and reached at its path", async () => {
    await call(groupBy, "getOptions")();

    expect(server.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/settings/options" });
  });

  it("leaves the other endpoints their paths", async () => {
    await call(groupBy, "list")();

    expect(server.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/settings/list" });
  });
});

describe.each(GROUPINGS)("an OPTIONS operation (%s)", (groupBy) => {
  it("is generated, and sends OPTIONS", async () => {
    await call(groupBy, "optionsSettings")();

    expect(server.requests.at(-1)).toMatchObject({ method: "OPTIONS", path: "/v1/settings" });
  });
});

function reservedSpec(): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Reserved", version: "1" },
    servers: [{ url: `${server.url}/v1` }],
    paths: {
      "/raw/items": { get: { tags: ["raw"], operationId: "raw", ...ok } },
      "/raw/other": { get: { tags: ["raw"], operationId: "with", ...ok } },
    },
  });
}

describe.each(["tag", "path"] as const)("names a client reserves (%s)", (groupBy) => {
  it("are given to no group or endpoint, and each call still reaches its path", async () => {
    const files = generateCode(parseSpec(reservedSpec()), { type: "openapi", outputDir: "src", groupBy }, "res");
    const loaded = loadGenerated(files, "src/res/index.ts");

    await generatedCall(loaded, ["resApi", "rawGroup", "getItems"])();
    expect(server.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/raw/items" });
    await generatedCall(loaded, ["resApi", "rawGroup", "getOther"])();
    expect(server.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/raw/other" });
  });
});
