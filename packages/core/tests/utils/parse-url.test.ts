/**
 * Reading an address where the runtime has no `URL.parse` and no
 * `URL.canParse` — Safari before 17, Chrome before 120, Firefox before 115,
 * React Native without Expo — as where it has them: an API that keeps the
 * session in cookies is defined, called from a page and checked there as
 * anywhere, instead of throwing a TypeError the moment it is imported.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { ConfigurationError } from "../../src/errors/configuration-error";
import { parseUrl } from "../../src/utils/parse-url";

const SOURCES = fileURLToPath(new URL("../../src/", import.meta.url));
const { endpoint } = courier();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The platform's URL, without the static `parse` and `canParse` older runtimes lack. */
function withoutUrlParse(): void {
  class OlderURL extends URL {}
  Object.defineProperties(OlderURL, {
    parse: { value: undefined },
    canParse: { value: undefined },
  });
  vi.stubGlobal("URL", OlderURL);
}

function onPage(href: string): void {
  const page = new URL(href);
  vi.stubGlobal("location", {
    href,
    origin: page.origin,
    host: page.host,
    hostname: page.hostname,
  });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } })),
    ),
  );
}

function refusalOf(define: () => unknown): ConfigurationError {
  try {
    define();
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error("defined without complaint");
}

const accounts = (baseURL: string, allowedOrigins = ["https://app.example.com"]) =>
  defineApi({
    name: "accounts",
    baseURL,
    session: { cookies: ["sid"], allowedOrigins },
    endpoints: { me: endpoint.get("me") },
  });

describe.each([
  ["without URL.parse and URL.canParse", withoutUrlParse],
  ["with them", () => undefined],
])("an address read %s", (_name, setUp) => {
  it("is the URL it names", () => {
    setUp();

    const url = parseUrl("https://api.example.com/v1/users?page=2");

    expect(url?.origin).toBe("https://api.example.com");
    expect(url?.pathname).toBe("/v1/users");
  });

  it("is read against its base where it is relative", () => {
    setUp();

    expect(parseUrl("../v2/users", "https://api.example.com/v1/items")?.href).toBe(
      "https://api.example.com/v2/users",
    );
  });

  it("is nothing where it does not parse", () => {
    setUp();

    expect(parseUrl("/v1/users")).toBeUndefined();
    expect(parseUrl("https://api example.com")).toBeUndefined();
    expect(parseUrl("")).toBeUndefined();
  });
});

describe("on a runtime without URL.parse and URL.canParse", () => {
  it("defines an API that keeps the session in cookies", () => {
    withoutUrlParse();

    expect(() => accounts("https://api.example.com")).not.toThrow();
  });

  it("refuses the session over plain HTTP across the internet, as anywhere", () => {
    withoutUrlParse();

    expect(refusalOf(() => accounts("http://api.example.com")).code).toBe(
      "SESSION_INSECURE_TRANSPORT",
    );
  });

  it("refuses an allowed origin that is not one, as anywhere", () => {
    withoutUrlParse();

    expect(refusalOf(() => accounts("https://api.example.com", ["app.example.com"])).code).toBe(
      "INVALID_ALLOWED_ORIGIN",
    );
  });

  it("calls the API from a page on another site, and says once what the browser does", async () => {
    withoutUrlParse();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onPage("http://localhost:3000/account");
    const api = createCaller(accounts("http://127.0.0.1:4000"));

    await expect(api.me()).resolves.toEqual({});
    await expect(api.me()).resolves.toEqual({});

    const said = warn.mock.calls
      .flat()
      .filter((line) => String(line).includes("on another site than this page"));
    expect(said).toHaveLength(1);
  });
});

describe("the core's sources", () => {
  it("call neither URL.parse nor URL.canParse, which older runtimes lack", () => {
    const files = readdirSync(SOURCES, { recursive: true, encoding: "utf8" }).filter((file) =>
      file.endsWith(".ts"),
    );

    const calls = files.flatMap((file) =>
      readFileSync(join(SOURCES, file), "utf8")
        .split("\n")
        .filter((line) => /\bURL\.(parse|canParse)\(/.test(line) && !/^\s*(\*|\/\/)/.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );

    expect(files.length).toBeGreaterThan(100);
    expect(calls).toEqual([]);
  });
});
