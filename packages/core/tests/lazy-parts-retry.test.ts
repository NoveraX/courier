/**
 * What the core loads with the first call that needs it — a React Native
 * app's session, an endpoint's retry policy — is asked for again by the
 * next call when the load failed: one chunk the network dropped fails that
 * call alone, not every call after it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";

const loads = { native: 0, retry: 0 };
vi.mock("../src/session/native-session", async (importOriginal) => {
  loads.native += 1;
  if (loads.native === 1) throw new Error("Failed to fetch dynamically imported module");
  return importOriginal();
});
vi.mock("../src/middleware/retry-policies", async (importOriginal) => {
  loads.retry += 1;
  if (loads.retry === 1) throw new Error("Failed to fetch dynamically imported module");
  return importOriginal();
});

const { endpoint } = courier();
const sent = vi.fn(async () => Response.json({ ok: true }));

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
});
