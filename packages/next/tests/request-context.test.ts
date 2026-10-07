/**
 * The request a Next.js App Router serves, as the session reads it through
 * `next/headers`, for Next.js 14 and its synchronous functions as for 15
 * and 16 and their asynchronous ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const next = vi.hoisted(() => ({
  headers: vi.fn<() => unknown>(),
  cookies: vi.fn<() => unknown>(),
}));

vi.mock("next/headers", () => next);

import { nextIncomingRequest, nextRequestContext } from "../src/request-context";

const cookieStore = { set: vi.fn() };

beforeEach(() => {
  next.headers.mockResolvedValue(
    new Headers({ host: "app.example.com", "x-forwarded-proto": "https", cookie: "sid=a1" }),
  );
  next.cookies.mockResolvedValue(cookieStore);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("nextRequestContext", () => {
  it("reads a page's request: its origin, its cookies, the user's nearest address", async () => {
    next.headers.mockResolvedValue(
      new Headers({
        host: "localhost:3000",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-for": "198.51.100.4, 203.0.113.9",
        cookie: "sid=a1",
      }),
    );

    const incoming = await nextRequestContext();

    expect(incoming).toMatchObject({
      method: "GET",
      origin: "https://app.example.com",
      clientAddress: "203.0.113.9",
      fetchInit: { cache: "no-store" },
    });
    expect(incoming?.headers.get("cookie")).toBe("sid=a1");
  });

  it("reads a Server Action's request as a POST", async () => {
    next.headers.mockResolvedValue(new Headers({ host: "app.example.com", "next-action": "7f3a" }));

    expect((await nextIncomingRequest())?.method).toBe("POST");
  });

  it("works with Next.js 14's synchronous headers and cookies", async () => {
    next.headers.mockReturnValue(new Headers({ host: "app.example.com" }));
    next.cookies.mockReturnValue(cookieStore);

    expect((await nextIncomingRequest())?.origin).toBe("http://app.example.com");
  });

  it("finds no request where none is served — a build, a script", async () => {
    next.headers.mockRejectedValue(
      new Error("`headers` was called outside a request scope. Read more: …"),
    );

    await expect(nextIncomingRequest()).resolves.toBeUndefined();
  });

  it("passes on what Next.js stops a static render with", async () => {
    const dynamic = Object.assign(new Error("Dynamic server usage: headers"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    next.headers.mockRejectedValue(dynamic);

    await expect(nextIncomingRequest()).rejects.toBe(dynamic);
  });
});

describe("a cookie the API sets, handed to Next.js", () => {
  const relayed = {
    cookie: {
      name: "sid",
      value: "s%3Aabc.def",
      path: "/",
      maxAge: 3600,
      secure: true,
      httpOnly: true,
      sameSite: "Lax" as const,
    },
    header: "sid=s%3Aabc.def; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax",
  };

  it("is set so that the browser receives exactly what the API sent", async () => {
    const incoming = await nextIncomingRequest();

    const result = incoming?.setCookie?.(relayed);

    expect(result).toBe(true);
    expect(cookieStore.set).toHaveBeenCalledWith({
      name: "sid",
      value: "s:abc.def",
      path: "/",
      maxAge: 3600,
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    });
  });

  it("is not set when Next.js would change its value on the way", async () => {
    const incoming = await nextIncomingRequest();

    const result = incoming?.setCookie?.({
      ...relayed,
      cookie: { ...relayed.cookie, value: "YWJj+ZGVm/==" },
    });

    expect(result).toContain("would arrive changed");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("is refused, with the reason, while a page renders", async () => {
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler. Read more: …",
      );
    });
    const incoming = await nextIncomingRequest();

    expect(incoming?.setCookie?.(relayed)).toBe(
      "Next.js lets a Server Action or a Route Handler set cookies, not a page while it renders",
    );
  });
});
