/**
 * What the core loads with the first call that needs it — a React Native
 * app's session, an endpoint's retry policy, the encoding of a record that
 * holds a file, what reads the cookies a page's browser keeps — is asked
 * for again by the next call when the load failed: one chunk the network
 * dropped fails that call alone, not every call after it. A page's call
 * that would have read its browser's cookies reads the page's copy instead.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { createProxyCaller } from "../src/proxy-caller";

const loads = { native: 0, retry: 0, upload: 0, stored: 0 };
vi.mock("../src/session/native-session", async (importOriginal) => {
  loads.native += 1;
  if (loads.native === 1) throw new Error("Failed to fetch dynamically imported module");
  return importOriginal();
});
vi.mock("../src/session/stored-cookies", async (importOriginal) => {
  loads.stored += 1;
  if (loads.stored === 1) throw new Error("Failed to fetch dynamically imported module");
  return importOriginal();
});
vi.mock("../src/middleware/retry-policies", async (importOriginal) => {
  loads.retry += 1;
  if (loads.retry === 1) throw new Error("Failed to fetch dynamically imported module");
  return importOriginal();
});
vi.mock("../src/utils/record-upload", async (importOriginal) => {
  loads.upload += 1;
  if (loads.upload === 1) throw new Error("Failed to fetch dynamically imported module");
  return importOriginal();
});

const { endpoint } = courier();
const sent = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
  Response.json({ ok: true }),
);

afterEach(() => {
  vi.unstubAllGlobals();
  sent.mockClear();
});

describe("a part that failed to load once", () => {
  it("loads a React Native app's session again for the next call, which goes", async () => {
    vi.stubGlobal("location", undefined);
    vi.stubGlobal("navigator", { product: "ReactNative" });
    vi.stubGlobal("fetch", sent);
    const caller = createCaller(
      defineApi({
        name: "accounts",
        baseURL: "https://api.example.com",
        session: { cookies: ["sid"] },
        endpoints: { me: endpoint.get("me") },
      }),
    );

    await expect(caller.me()).rejects.toThrow();
    await caller.me();

    expect(loads.native).toBe(2);
    expect(sent).toHaveBeenCalledOnce();
  });

  it("reads the cookies a page's browser keeps with the next call, the one it failed for going with the page's copy", async () => {
    vi.stubGlobal("fetch", sent);
    vi.stubGlobal("document", { cookie: "at=copied" });
    vi.stubGlobal("cookieStore", { getAll: async () => [{ name: "at", value: "kept" }] });
    const caller = createCaller(
      defineApi({
        name: "profile",
        baseURL: "https://api.example.com",
        session: { bearer: "at" },
        endpoints: { me: endpoint.get("me") },
      }),
    );

    await caller.me();
    await caller.me();

    expect(loads.stored).toBe(2);
    expect(
      sent.mock.calls.map(([, init]) => new Headers(init?.headers).get("authorization")),
    ).toEqual(["Bearer copied", "Bearer kept"]);
  });

  it("loads an endpoint's retry policy again for the next call, which goes", async () => {
    vi.stubGlobal("fetch", sent);
    const caller = createCaller(
      defineApi({
        name: "catalog",
        baseURL: "https://api.example.com",
        endpoints: { list: endpoint.get("items").retry({ limit: 1, delay: 1, backoff: "fixed" }) },
      }),
    );

    await expect(caller.list()).rejects.toThrow();
    await caller.list();

    expect(loads.retry).toBe(2);
    expect(sent).toHaveBeenCalledOnce();
  });

  it("loads the encoding of a record that holds a file again for the next call, which goes", async () => {
    vi.stubGlobal("fetch", sent);
    const api = defineApi({
      name: "books",
      baseURL: "https://api.example.com",
      expose: true,
      endpoints: { save: endpoint.post("books").variables<{ title: string; cover: Blob }>() },
    });
    const page = createProxyCaller(routesOf(api, "api"), {
      proxyPath: { http: "https://app.example.com/api/request" },
    });
    const record = { title: "Dune", cover: new Blob(["png"]) };

    await expect(page.save(record)).rejects.toThrow();
    await page.save(record);

    expect(loads.upload).toBe(2);
    expect(sent).toHaveBeenCalledOnce();
  });
});
