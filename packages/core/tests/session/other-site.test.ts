/**
 * A page calling an API that keeps the user's session in cookies, on
 * another site than its own: the browser decides whether the API gets its
 * cookies — Safari sends none — so Courier says so once, and says nothing
 * where the API shares the page's site, set `credentials` itself, or where
 * no page is.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { sameSite } from "../../src/session/other-site";

const { endpoint } = courier();

function accounts(name: string, baseURL: string, credentials?: RequestCredentials) {
  return createCaller(
    defineApi({
      name,
      baseURL,
      session: { cookies: ["sid"] },
      ...(credentials && { credentials }),
      endpoints: { me: endpoint.get("me") },
    }),
  );
}

function onPage(href: string): void {
  const url = new URL(href);
  vi.stubGlobal("location", { href, origin: url.origin, host: url.host, hostname: url.hostname });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } })),
    ),
  );
}

const warnings = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.flat().filter((line) => String(line).includes("on another site than this page"));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a page whose session API is on another site", () => {
  it("is told once, with what to do, however many calls it makes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onPage("http://localhost:3000/account");
    const api = accounts("crossing", "http://127.0.0.1:4000");

    await api.me();
    await api.me();

    const said = warnings(warn);
    expect(said).toHaveLength(1);
    expect(String(said[0])).toContain(
      "crossing: the API at http://127.0.0.1:4000 is on another site than this page, http://localhost:3000",
    );
    expect(String(said[0])).toContain("Safari sends an API on another site none of its cookies");
    expect(String(said[0])).toContain("call it through Courier's proxy");
  });

  it("is told nothing where the API is on a subdomain of its site, or set credentials itself", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onPage("https://app.example.com/");

    await accounts("subdomain", "https://api.example.com/v1").me();
    await accounts("relative", "/api").me();
    await accounts("own", "https://api.other.com", "include").me();

    expect(warnings(warn)).toEqual([]);
  });

  it("is told nothing where there is no page, as in React Native", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } })),
      ),
    );

    await accounts("native", "https://api.other.com").me();

    expect(warnings(warn)).toEqual([]);
  });
});

describe("whether two hosts are one site", () => {
  it("holds for the same host, one under the other, and two sharing their last two labels", () => {
    expect(sameSite("app.example.com", "APP.example.com.")).toBe(true);
    expect(sameSite("example.com", "api.example.com")).toBe(true);
    expect(sameSite("app.example.com", "api.example.com")).toBe(true);
    expect(sameSite("localhost", "api.localhost")).toBe(true);
  });

  it("fails for other domains, and for IP addresses other than the same one", () => {
    expect(sameSite("example.com", "example.org")).toBe(false);
    expect(sameSite("localhost", "127.0.0.1")).toBe(false);
    expect(sameSite("127.0.0.1", "127.0.0.2")).toBe(false);
    expect(sameSite("[::1]", "localhost")).toBe(false);
    expect(sameSite("127.0.0.1", "127.0.0.1")).toBe(true);
  });
});
