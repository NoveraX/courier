/**
 * A React Native app calling an API whose double-submit token it has not
 * kept yet — after the app starts again, say, while the platform still holds
 * the cookie: a write asks where the API hands the token out first, and
 * repeats what the answer set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchSpy = vi.fn();

async function accounts() {
  const { createCaller } = await import("../../src/caller");
  const { defineApi } = await import("../../src/define/api");
  const { courier } = await import("../../src/define/courier");
  const { endpoint } = courier();
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL: "https://api.example.com",
      session: {
        cookies: ["sessionid"],
        csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "csrf/" },
      },
      endpoints: { rename: endpoint.post("me/name").variables<{ name: string }>() },
    }),
  );
}

function urlOf(index: number): string {
  const input: unknown = fetchSpy.mock.calls[index]?.[0];
  return input instanceof Request ? input.url : String(input);
}

function tokenSent(index: number): string | null {
  return new Headers(((fetchSpy.mock.calls[index]?.[1] ?? {}) as RequestInit).headers).get(
    "x-csrftoken",
  );
}

beforeEach(() => {
  vi.resetModules();
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((input: unknown) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.endsWith("/csrf/")) return Promise.resolve(Response.json({ ok: true }));
    /* React Native hands a script the cookies an answer sets, joined into one header. */
    const headers = [["set-cookie", "csrftoken=t-native; Path=/; Max-Age=31449600"]] as [
      string,
      string,
    ][];
    return Promise.resolve(new Response(null, { status: 204, headers }));
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("navigator", { product: "ReactNative" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a write in a React Native app that has kept no double-submit token", () => {
  it("asks where the API hands it out, then repeats the token the answer set", async () => {
    await (await accounts()).rename({ name: "Ada" });

    expect(urlOf(0)).toBe("https://api.example.com/csrf/");
    expect(urlOf(1)).toBe("https://api.example.com/me/name");
    expect(tokenSent(1)).toBe("t-native");
  });

  it("asks once, and a later write repeats the token it kept", async () => {
    const api = await accounts();

    await Promise.all([api.rename({ name: "Ada" }), api.rename({ name: "Grace" })]);
    await api.rename({ name: "Linus" });

    const asked = fetchSpy.mock.calls.filter((_, index) => urlOf(index).endsWith("/csrf/"));
    expect(asked).toHaveLength(1);
    expect([tokenSent(1), tokenSent(2), tokenSent(3)]).toEqual([
      "t-native",
      "t-native",
      "t-native",
    ]);
  });
});
