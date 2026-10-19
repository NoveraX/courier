/**
 * Where a Postman collection's requests go, checked by calling the generated
 * client against real servers.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedCall, loadGenerated } from "../../helpers/generated-project";
import { type RecordingServer, startRecordingServer } from "../../helpers/recording-server";

const GROUPINGS = ["tag", "path", "single"] as const;

let api: RecordingServer;
let auth: RecordingServer;

beforeAll(async () => {
  const reply = () => ({ contentType: "application/json", body: "{}" });
  api = await startRecordingServer(reply);
  auth = await startRecordingServer(reply);
});

afterAll(async () => {
  await api.close();
  await auth.close();
});

/** Most requests use `{{baseUrl}}`; logging in goes to a host of its own. */
function collection(): string {
  const onBase = (name: string, method: string, path: string[]) => ({
    name,
    request: {
      method,
      url: { raw: `{{baseUrl}}/${path.join("/")}`, host: ["{{baseUrl}}"], path },
    },
  });
  const { hostname, port } = new URL(auth.url);
  return JSON.stringify({
    info: {
      name: "Acme",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [{ key: "baseUrl", value: `${api.url}/pm/` }],
    item: [
      {
        name: "Users",
        item: [
          onBase("List users", "GET", ["users"]),
          onBase("Get user", "GET", ["users", ":id"]),
          onBase("Delete user", "DELETE", ["users", ":id"]),
        ],
      },
      {
        name: "Auth",
        item: [
          {
            name: "Login",
            request: {
              method: "POST",
              url: {
                raw: `${auth.url}/auth/login`,
                protocol: "http",
                host: [hostname],
                port,
                path: ["auth", "login"],
              },
            },
          },
          {
            name: "Refresh",
            request: {
              method: "POST",
              url: {
                raw: `${auth.url}/auth/refresh?scope=read`,
                protocol: "http",
                host: [hostname],
                port,
                path: ["auth", "refresh"],
                query: [{ key: "scope", value: "read" }],
              },
            },
          },
          onBase("Verify", "POST", ["auth", "verify"]),
        ],
      },
    ],
  });
}

function caller(groupBy: (typeof GROUPINGS)[number]) {
  const files = generateCode(
    parseSpec(collection()),
    { type: "postman", outputDir: "src", groupBy },
    "acme",
  );
  const index = loadGenerated(files, "src/acme/index.ts");
  /* Folders and first path segments name the groups alike here. */
  const group = (name: string) => (groupBy === "single" ? ["acmeApi"] : ["acmeApi", name]);
  return {
    users: (name: string) => generatedCall(index, [...group("users"), name]),
    auth: (name: string) => generatedCall(index, [...group("auth"), name]),
  };
}

describe("a collection whose requests name {{baseUrl}}", () => {
  it("takes the variable's value as its base URL", () => {
    expect(parseSpec(collection()).baseURL).toBe(`${api.url}/pm`);
  });

  it.each(GROUPINGS)("sends those requests there (%s)", async (groupBy) => {
    await caller(groupBy).users("getUser")({ id: "u1" });

    expect(api.requests.at(-1)).toMatchObject({ method: "GET", path: "/pm/users/u1" });
  });

  it.each(GROUPINGS)(
    "sends a request written with another host to that host (%s)",
    async (groupBy) => {
      const before = api.requests.length;

      await caller(groupBy).auth("login")({ username: "u" });
      await caller(groupBy).auth("verify")({ code: "1" });

      expect(auth.requests.at(-1)).toMatchObject({ method: "POST", path: "/auth/login" });
      expect(api.requests.slice(before)).toMatchObject([
        { method: "POST", path: "/pm/auth/verify" },
      ]);
    },
  );

  /* A write with a query parameter is sent through a closure, which has to
     name the other host as well. */
  it.each(GROUPINGS)(
    "sends a write with a query parameter to its own host (%s)",
    async (groupBy) => {
      const before = api.requests.length;

      await caller(groupBy).auth("refresh")({ scope: "write" });

      expect(auth.requests.at(-1)).toMatchObject({
        method: "POST",
        path: "/auth/refresh",
        query: [["scope", "write"]],
        body: "",
      });
      expect(api.requests.length).toBe(before);
    },
  );
});

describe("parsePostman, group names", () => {
  /* A collection of one folder per name, each holding one request. */
  function folders(...names: string[]): string {
    return JSON.stringify({
      info: { name: "Acme", schema: "https://schema.getpostman.com/json/collection/v2.1.0/" },
      item: names.map((name, at) => ({
        name,
        item: [
          { name: `Request ${at}`, request: { method: "GET", url: `https://acme.test/r${at}` } },
        ],
      })),
    });
  }

  it("names a group after a folder of 140 characters within 128, and the import is generated", () => {
    const spec = parseSpec(folders("f".repeat(140)));
    const files = generateCode(spec, { type: "openapi", outputDir: "src/api" }, "acme");

    expect(spec.groups.map((group) => group.name)).toEqual(["f".repeat(128)]);
    expect(files.some((file) => file.path === `src/api/acme/${"f".repeat(128)}/index.ts`)).toBe(
      true,
    );
  });

  it("names a group whose folder spells no name after the path its requests share", () => {
    expect(parseSpec(folders("***", "~~~")).groups.map((group) => group.name)).toEqual([
      "r0",
      "r1",
    ]);
  });

  it("reads folders nested 10 000 deep", () => {
    /* Written as text: JSON.stringify itself recurses, and runs out of stack at this depth. */
    const deep =
      '{"name":"Deep","item":[{"name":"Ping","request":{"method":"GET","url":"https://acme.test/ping"}}]}';
    const levels = Array.from(
      { length: 10_000 },
      (_, depth) => `{"name":"Level ${depth}","item":[`,
    );
    const folder = `${levels.join("")}${deep}${"]}".repeat(10_000)}`;
    const info =
      '"info":{"name":"Acme","schema":"https://schema.getpostman.com/json/collection/v2.1.0/"}';

    expect(parseSpec(`{${info},"item":[${folder}]}`).groups.map((group) => group.name)).toEqual([
      "deep",
    ]);
  });

  it("numbers three folders of one long name within 128", () => {
    const long = "f".repeat(140);

    expect(parseSpec(folders(long, long, long)).groups.map((group) => group.name)).toEqual([
      "f".repeat(128),
      `${"f".repeat(127)}2`,
      `${"f".repeat(127)}3`,
    ]);
  });
});
