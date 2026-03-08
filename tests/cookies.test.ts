import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { NextResponse } from "next/server";
import { Request } from "../src/RequestClass";
import type { MethodsInstance } from "../src/instance/types";
import { createRequest } from "../src/utils/createRequest";

let mockKyInstance: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  mockKyInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(),
  };

  vi.spyOn(ky, "create").mockReturnValue(mockKyInstance as unknown as typeof ky);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createTestSource(methods: Record<string, Function>, options = {}) {
  const source = new Request(options);
  for (const [name, fn] of Object.entries(methods)) {
    (source as Record<string, unknown>)[name] = fn;
  }
  return source;
}

function makeResponseWithCookies(data: unknown, cookies: string[]) {
  const headers = new Headers();
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
  return {
    status: 200,
    headers,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    body: null,
  };
}

describe("cookie forwarding", () => {
  it("forwards a single cookie via set-cookie", async () => {
    mockKyInstance.get.mockResolvedValue(
      makeResponseWithCookies({ ok: true }, ["session=abc123; Path=/; HttpOnly"]),
    );

    const source = createTestSource({
      login: (methods: MethodsInstance) => methods.get("login"),
    });

    const res = new NextResponse();
    const result = (await createRequest({ api: source }, { source: "api", query: "login" }, {
      res,
    })) as Response;

    const setCookies = result.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes("session=abc123"))).toBe(true);
  });

  it("forwards multiple cookies", async () => {
    mockKyInstance.get.mockResolvedValue(
      makeResponseWithCookies({ ok: true }, [
        "session=abc123; Path=/; HttpOnly",
        "token=xyz789; Path=/; Secure",
      ]),
    );

    const source = createTestSource({
      login: (methods: MethodsInstance) => methods.get("login"),
    });

    const res = new NextResponse();
    const result = (await createRequest({ api: source }, { source: "api", query: "login" }, {
      res,
    })) as Response;

    const setCookies = result.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes("session=abc123"))).toBe(true);
    expect(setCookies.some((c) => c.includes("token=xyz789"))).toBe(true);
  });

  it("does not split cookies with dates (comma in Expires)", async () => {
    mockKyInstance.get.mockResolvedValue(
      makeResponseWithCookies({ ok: true }, [
        "session=abc; Expires=Thu, 01 Jan 2099 00:00:00 GMT; Path=/",
      ]),
    );

    const source = createTestSource({
      login: (methods: MethodsInstance) => methods.get("login"),
    });

    const res = new NextResponse();
    const result = (await createRequest({ api: source }, { source: "api", query: "login" }, {
      res,
    })) as Response;

    const setCookies = result.headers.getSetCookie();
    const fullCookie = setCookies.find((c) => c.includes("session=abc"));
    expect(fullCookie).toBeDefined();
    expect(fullCookie).toContain("Expires=Thu, 01 Jan 2099");
  });

  it("returns Response (not data) when context has NextResponse", async () => {
    mockKyInstance.get.mockResolvedValue(
      makeResponseWithCookies({ ok: true }, []),
    );

    const source = createTestSource({
      list: (methods: MethodsInstance) => methods.get("users"),
    });

    const res = new NextResponse();
    const result = await createRequest({ api: source }, { source: "api", query: "list" }, {
      res,
    });

    expect(result).toBeInstanceOf(Response);
  });
});
