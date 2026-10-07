/**
 * A caller in a React Native app, whose platform keeps the user's cookies
 * and sends them itself, but where no script can read them: the cookies a
 * page would read are kept from the API's answers, and repeated as a page
 * repeats them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionOptions } from "../../src/session/types";

const fetchSpy = vi.fn();
const answers: Array<() => Response> = [];

const SESSION = {
  cookies: ["sid"],
  csrf: { cookie: "csrftoken", header: "x-csrftoken" },
} satisfies SessionOptions;

/* Built after the modules are reset, so each check starts with nothing kept. */
async function apiAt(baseURL: string, session: SessionOptions = SESSION) {
  const { createCaller } = await import("../../src/caller");
  const { defineApi } = await import("../../src/define/api");
  const { courier } = await import("../../src/define/courier");
  const { endpoint } = courier();
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL,
      session,
      endpoints: {
        me: endpoint.get("me"),
        login: endpoint.post("login"),
        rename: endpoint.post("me/name").variables<{ name: string }>(),
      },
    }),
  );
}

function answerWith(cookies: string[], status = 200): void {
  answers.push(() =>
    Response.json(status < 400 ? { ok: true } : { error: "refused" }, {
      status,
      headers: cookies.map((cookie): [string, string] => ["set-cookie", cookie]),
    }),
  );
}

function sentHeaders(index: number): Headers {
  const init = (fetchSpy.mock.calls[index]?.[1] ?? {}) as RequestInit;
  return new Headers(init.headers);
}

beforeEach(() => {
  vi.resetModules();
  answers.length = 0;
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(() =>
    Promise.resolve(answers.shift()?.() ?? Response.json({ ok: true })),
  );
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("navigator", { product: "ReactNative" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a session in a React Native app", () => {
  it("asks the platform to send the cookies it keeps", async () => {
    await (await apiAt("https://api.example.com")).me();

    expect(((fetchSpy.mock.calls[0]?.[1] ?? {}) as RequestInit).credentials).toBe("include");
  });

  it("repeats the double-submit token an answer set on the writes that follow, not on reads", async () => {
    const api = await apiAt("https://api.example.com");
    answerWith(["sid=s1; Path=/; HttpOnly", "csrftoken=t1; Path=/; Max-Age=31449600"]);

    await api.login();
    await api.me();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(0).has("x-csrftoken")).toBe(false);
    expect(sentHeaders(1).has("x-csrftoken")).toBe(false);
    expect(sentHeaders(2).get("x-csrftoken")).toBe("t1");
  });

  it("splits the Set-Cookie headers the platform joined into one, dates and all", async () => {
    const api = await apiAt("https://api.example.com");
    answerWith([
      "sid=s1; Path=/; HttpOnly; Expires=Wed, 21 Oct 2037 07:28:00 GMT, csrftoken=t9; Path=/; Expires=Thu, 22 Oct 2037 07:28:00 GMT, theme=dark",
    ]);

    await api.login();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(1).get("x-csrftoken")).toBe("t9");
  });

  it("keeps what an error answer sets, as a success's", async () => {
    const api = await apiAt("https://api.example.com");
    answerWith(["csrftoken=t2; Path=/"], 403);

    await expect(api.rename({ name: "Ada" })).rejects.toMatchObject({ status: 403 });
    await api.rename({ name: "Ada" });

    expect(sentHeaders(1).get("x-csrftoken")).toBe("t2");
  });

  it("keeps nothing set HttpOnly, and drops the token such a cookie replaces", async () => {
    const api = await apiAt("https://api.example.com");
    answerWith(["csrftoken=t1; Path=/"]);
    answerWith(["csrftoken=t3; Path=/; HttpOnly"]);

    await api.login();
    await api.me();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(2).has("x-csrftoken")).toBe(false);
  });

  it("forgets a token the API deletes", async () => {
    const api = await apiAt("https://api.example.com");
    answerWith(["csrftoken=t1; Path=/"]);
    answerWith(["csrftoken=; Path=/; Max-Age=0"]);

    await api.login();
    await api.me();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(2).has("x-csrftoken")).toBe(false);
  });

  it("forgets a token past its time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const api = await apiAt("https://api.example.com");
    answerWith(["csrftoken=t1; Path=/; Max-Age=60"]);

    await api.login();
    await api.rename({ name: "Ada" });
    vi.setSystemTime(new Date("2026-10-07T12:01:01Z"));
    await api.rename({ name: "Ada" });

    expect(sentHeaders(1).get("x-csrftoken")).toBe("t1");
    expect(sentHeaders(2).has("x-csrftoken")).toBe(false);
  });

  it("sends a bearer token an answer set where a page could read it", async () => {
    const api = await apiAt("https://api.example.com", { bearer: "access_token" });
    answerWith(["access_token=tok.en; Path=/"]);

    await api.login();
    await api.me();

    expect(sentHeaders(1).get("authorization")).toBe("Bearer tok.en");
  });

  it("repeats a token to the host that set it, not to another API", async () => {
    const api = await apiAt("https://api.example.com");
    const other = await apiAt("https://api.example.org");
    answerWith(["csrftoken=t1; Path=/"]);

    await api.login();
    await other.rename({ name: "Ada" });

    expect(sentHeaders(1).has("x-csrftoken")).toBe(false);
  });

  it("repeats a token set for a domain to the hosts below it", async () => {
    const api = await apiAt("https://api.example.com");
    const sibling = await apiAt("https://auth.example.com");
    answerWith(["csrftoken=t1; Domain=example.com; Path=/"]);

    await api.login();
    await sibling.rename({ name: "Ada" });

    expect(sentHeaders(1).get("x-csrftoken")).toBe("t1");
  });

  it("keeps no token set for a domain the API is not in", async () => {
    const api = await apiAt("https://api.example.com");
    answerWith(["csrftoken=t1; Domain=example.org; Path=/"]);

    await api.login();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(1).has("x-csrftoken")).toBe(false);
  });

  it("repeats a token whose path lies below the API's address, and not one for another path", async () => {
    const api = await apiAt("https://api.example.com/v1");
    answerWith(["csrftoken=t1; Path=/v1/auth", "other_csrf=x; Path=/admin"]);

    await api.login();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(1).get("x-csrftoken")).toBe("t1");
  });

  it("repeats no token the API set Secure to an address over plain HTTP", async () => {
    const api = await apiAt("http://10.0.2.2:8000");
    answerWith(["csrftoken=t1; Path=/; Secure"]);

    await api.login();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(1).has("x-csrftoken")).toBe(false);
  });

  it("writes no Cookie header, which the platform writes itself", async () => {
    const api = await apiAt("https://api.example.com");
    answerWith(["sid=s1; Path=/", "csrftoken=t1; Path=/"]);

    await api.login();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(1).has("cookie")).toBe(false);
  });
});

describe("a session in a browser", () => {
  it("takes nothing from the answers: the page's own cookies are what it reads", async () => {
    vi.stubGlobal("navigator", { product: "Gecko" });
    vi.stubGlobal("document", { cookie: "csrftoken=from-page" });
    const api = await apiAt("https://api.example.com");
    answerWith(["csrftoken=t1; Path=/"]);

    await api.login();
    await api.rename({ name: "Ada" });

    expect(sentHeaders(1).get("x-csrftoken")).toBe("from-page");
  });
});
