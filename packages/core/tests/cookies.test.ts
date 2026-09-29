import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpMethods } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";
import { asEndpoint } from "./helpers/as-endpoint";

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function wrapAll(methods: Record<string, Function>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(methods).map(([name, fn]) => [name, asEndpoint(fn as never)]),
  );
}

function createTestSource(methods: Record<string, Function>, options = {}) {
  return { options, ...wrapAll(methods) };
}

function makeResponseWithCookies(data: unknown, cookies: string[]) {
  const headers = new Headers();
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
  return new Response(JSON.stringify(data), { status: 200, headers });
}

const NAMES_SET_COOKIE = { allowedHeaders: ["set-cookie"] };

describe("cookie forwarding", () => {
  it("passes back no cookie the upstream set unless Set-Cookie is named", async () => {
    fetchSpy.mockResolvedValue(
      makeResponseWithCookies({ ok: true }, ["session=abc123; Path=/; HttpOnly"]),
    );
    const source = createTestSource({
      login: (methods: HttpMethods) => methods.get("login"),
    });

    const result = (await executeRequest(
      { api: source },
      { source: "api", method: "login" },
      {
        res: new NextResponse(),
      },
    )) as Response;

    expect(result.headers.getSetCookie()).toEqual([]);
  });

  it("forwards a single cookie via set-cookie", async () => {
    fetchSpy.mockResolvedValue(
      makeResponseWithCookies({ ok: true }, ["session=abc123; Path=/; HttpOnly"]),
    );

    const source = createTestSource(
      {
        login: (methods: HttpMethods) => methods.get("login"),
      },
      NAMES_SET_COOKIE,
    );

    const res = new NextResponse();
    const result = (await executeRequest(
      { api: source },
      { source: "api", method: "login" },
      {
        res,
      },
    )) as Response;

    const setCookies = result.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes("session=abc123"))).toBe(true);
  });

  it("forwards multiple cookies", async () => {
    fetchSpy.mockResolvedValue(
      makeResponseWithCookies({ ok: true }, [
        "session=abc123; Path=/; HttpOnly",
        "token=xyz789; Path=/; Secure",
      ]),
    );

    const source = createTestSource(
      {
        login: (methods: HttpMethods) => methods.get("login"),
      },
      NAMES_SET_COOKIE,
    );

    const res = new NextResponse();
    const result = (await executeRequest(
      { api: source },
      { source: "api", method: "login" },
      {
        res,
      },
    )) as Response;

    const setCookies = result.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes("session=abc123"))).toBe(true);
    expect(setCookies.some((c) => c.includes("token=xyz789"))).toBe(true);
  });

  it("does not split cookies with dates (comma in Expires)", async () => {
    fetchSpy.mockResolvedValue(
      makeResponseWithCookies({ ok: true }, [
        "session=abc; Expires=Thu, 01 Jan 2099 00:00:00 GMT; Path=/",
      ]),
    );

    const source = createTestSource(
      {
        login: (methods: HttpMethods) => methods.get("login"),
      },
      NAMES_SET_COOKIE,
    );

    const res = new NextResponse();
    const result = (await executeRequest(
      { api: source },
      { source: "api", method: "login" },
      {
        res,
      },
    )) as Response;

    const setCookies = result.headers.getSetCookie();
    const fullCookie = setCookies.find((c) => c.includes("session=abc"));
    expect(fullCookie).toBeDefined();
    expect(fullCookie).toContain("Expires=Thu, 01 Jan 2099");
  });

  it("returns Response (not data) when context has NextResponse", async () => {
    fetchSpy.mockResolvedValue(makeResponseWithCookies({ ok: true }, []));

    const source = createTestSource({
      list: (methods: HttpMethods) => methods.get("users"),
    });

    const res = new NextResponse();
    const result = await executeRequest(
      { api: source },
      { source: "api", method: "list" },
      {
        res,
      },
    );

    expect(result).toBeInstanceOf(Response);
  });
});
