/**
 * A caller made in a browser — a single-page app calling its API directly —
 * where the browser keeps the user's cookies and sends them itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";

const { endpoint } = courier();
const fetchSpy = vi.fn();

function sentInit(index = 0): RequestInit {
  return (fetchSpy.mock.calls[index]?.[1] ?? {}) as RequestInit;
}

function sentHeaders(index = 0): Headers {
  return new Headers(sentInit(index).headers);
}

function apiWith(
  session: Parameters<typeof defineApi>[0]["session"],
  credentials?: RequestCredentials,
) {
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL: "https://api.example.com",
      session,
      ...(credentials && { credentials }),
      endpoints: {
        me: endpoint.get("me"),
        rename: endpoint.post("me/name").variables<{ name: string }>(),
      },
    }),
  );
}

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("document", { cookie: "theme=dark; access_token=tok.en; XSRF-TOKEN=eyJ%3D" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a session in the browser", () => {
  it("asks the browser to send its cookies, to another origin too", async () => {
    await apiWith({ cookies: ["sid"] }).me();

    expect(sentInit().credentials).toBe("include");
  });

  it("leaves credentials to the API that set them itself", async () => {
    await apiWith({ cookies: ["sid"] }, "same-origin").me();

    expect(sentInit().credentials).toBe("same-origin");
  });

  it("adds no Cookie header, which only the browser may write", async () => {
    await apiWith({ cookies: ["theme"] }).me();

    expect(sentHeaders().has("cookie")).toBe(false);
  });

  it("sends a bearer token the page can read", async () => {
    await apiWith({ bearer: "access_token" }).me();

    expect(sentHeaders().get("authorization")).toBe("Bearer tok.en");
  });

  it("repeats a readable double-submit token on a write, decoded, and only on a write", async () => {
    const client = apiWith({
      cookies: ["sid"],
      csrf: { cookie: "XSRF-TOKEN", header: "X-XSRF-TOKEN" },
    });

    await client.me();
    await client.rename({ name: "Ada" });

    expect(sentHeaders(0).has("x-xsrf-token")).toBe(false);
    expect(sentHeaders(1).get("x-xsrf-token")).toBe("eyJ=");
  });

  it("adds nothing a preflight would be needed for when nothing is readable", async () => {
    vi.stubGlobal("document", { cookie: "" });

    await apiWith({ cookies: ["sid"], bearer: "access_token" }).me();

    expect([...sentHeaders().keys()].filter((name) => name !== "content-type")).toEqual([]);
  });
});
