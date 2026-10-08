/**
 * The cookies a React Native app keeps from an API's answers: which it
 * keeps, for which addresses, and for how long.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as LearnedCookies from "../../src/session/learned-cookies";
import type { SessionOptions } from "../../src/session/types";

const SESSION = {
  cookies: ["sid"],
  csrf: { cookie: "csrftoken", header: "x-csrftoken" },
} satisfies SessionOptions;
const NOW = Date.parse("2026-10-07T12:00:00Z");

let store: typeof LearnedCookies;

/* React Native's fetch hands a script one header with every cookie, and no `getSetCookie`. */
function joined(value: string): Headers {
  return { get: (name: string) => (name === "set-cookie" ? value : null) } as unknown as Headers;
}

beforeEach(async () => {
  vi.resetModules();
  store = await import("../../src/session/learned-cookies");
});

describe("the cookies kept from an answer", () => {
  it("are the session's that a page could read, from a header React Native joined", () => {
    store.learnCookies(
      joined("sid=s1; HttpOnly, csrftoken=t1; Path=/, theme=dark; Path=/"),
      SESSION,
      "https://api.example.com",
      NOW,
    );

    expect([...store.learnedJar("https://api.example.com", NOW)]).toEqual([["csrftoken", "t1"]]);
  });

  it("include a session cookie a page could read, as a page reads it", () => {
    store.learnCookies(joined("sid=s1; Path=/"), SESSION, "https://api.example.com", NOW);

    expect(store.learnedJar("https://api.example.com", NOW).get("sid")).toBe("s1");
  });

  it("are kept as long as their Expires says, and dropped after", () => {
    store.learnCookies(
      joined("csrftoken=t1; Path=/; Expires=Wed, 07 Oct 2026 12:00:30 GMT"),
      SESSION,
      "https://api.example.com",
      NOW,
    );

    expect(store.learnedJar("https://api.example.com", NOW + 29_000).get("csrftoken")).toBe("t1");
    expect(store.learnedJar("https://api.example.com", NOW + 31_000).has("csrftoken")).toBe(false);
  });

  it("are told apart by path, the one for the longest path first", () => {
    store.learnCookies(
      joined("csrftoken=root; Path=/, csrftoken=v1; Path=/v1"),
      SESSION,
      "https://api.example.com/v1",
      NOW,
    );

    expect(store.learnedJar("https://api.example.com/v1", NOW).get("csrftoken")).toBe("v1");
    expect(store.learnedJar("https://api.example.com/v2", NOW).get("csrftoken")).toBe("root");
  });

  it("are not offered to an address whose path only begins with the cookie's", () => {
    store.learnCookies(joined("csrftoken=t1; Path=/v1"), SESSION, "https://api.example.com", NOW);

    expect(store.learnedJar("https://api.example.com/v10", NOW).has("csrftoken")).toBe(false);
  });

  it("are not kept for a domain of one label, which would reach every other API of the app", () => {
    store.learnCookies(
      joined("csrftoken=planted; Domain=com; Path=/"),
      SESSION,
      "https://api-b.com/session",
      NOW,
    );

    expect(store.learnedJar("https://api-a.com/orders", NOW).has("csrftoken")).toBe(false);
    expect(store.learnedJar("https://api-b.com/orders", NOW).has("csrftoken")).toBe(false);
  });

  it("are kept for a domain above the host of more than one label, and for the host itself", () => {
    store.learnCookies(
      joined("csrftoken=t1; Domain=example.com; Path=/, sid=s1; Domain=localhost; Path=/"),
      { ...SESSION, cookies: ["sid"] },
      "https://api.example.com/session",
      NOW,
    );
    store.learnCookies(
      joined("sid=s2; Domain=localhost; Path=/"),
      SESSION,
      "http://localhost:8000",
      NOW,
    );

    expect(store.learnedJar("https://files.example.com/", NOW).get("csrftoken")).toBe("t1");
    expect(store.learnedJar("http://localhost:8000/", NOW).get("sid")).toBe("s2");
  });

  it("are not kept for a domain an address made of digits would only end with", () => {
    store.learnCookies(
      joined("csrftoken=t1; Domain=0.0.1; Path=/"),
      SESSION,
      "http://127.0.0.1:8000",
      NOW,
    );

    expect(store.learnedJar("http://127.0.0.1:8000", NOW).has("csrftoken")).toBe(false);
  });

  it("are read from the headers a platform lists apart, too", () => {
    const headers = new Headers();
    headers.append("set-cookie", "sid=s1; HttpOnly");
    headers.append("set-cookie", "csrftoken=t1; Path=/");

    store.learnCookies(headers, SESSION, "https://api.example.com", NOW);

    expect(store.learnedJar("https://api.example.com", NOW).get("csrftoken")).toBe("t1");
  });

  it("are none for an answer that set no cookie", () => {
    store.learnCookies(new Headers(), SESSION, "https://api.example.com", NOW);

    expect(store.learnedJar("https://api.example.com", NOW).size).toBe(0);
  });
});
