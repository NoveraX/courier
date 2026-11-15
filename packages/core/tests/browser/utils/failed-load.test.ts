/**
 * A part of the package a page's call needs that did not arrive — the chunk
 * a deployment took away, a connection that dropped while it came — fails
 * that call as one that reached no server, as a page's bundle has it: a
 * `NetworkError` whose cause is the failure, which `onError` is told of and
 * `.safe()` resolves to, with nothing sent. So it is through the proxy, for
 * the encoding of a record that holds a file, and straight to an API, for
 * a retry policy, a write's request for its token, and the check of where
 * a session may go. After an encoding or a retry policy that did not load,
 * the next call asks for it again and goes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../../src/caller";
import { courier, defineApi } from "../../../src/define/index";
import { routesOf } from "../../../src/define/routes-of";
import { isNetworkError, type RequestFailure } from "../../../src/errors";
import { createProxyCaller } from "../../../src/proxy-caller";

vi.mock("../../../src/utils/failed-load", () => import("../../../src/browser/utils/failed-load"));

const loads = { retry: 0, upload: 0, prime: 0, transport: 0 };
vi.mock("../../../src/middleware/retry-policies", async (importOriginal) => {
  loads.retry += 1;
  if (loads.retry === 1) throw new TypeError("Failed to fetch dynamically imported module");
  return importOriginal();
});
vi.mock("../../../src/utils/record-upload", async (importOriginal) => {
  loads.upload += 1;
  if (loads.upload === 1) throw new TypeError("Failed to fetch dynamically imported module");
  return importOriginal();
});
vi.mock("../../../src/utils/csrf-prime", async (importOriginal) => {
  loads.prime += 1;
  if (loads.prime === 1) throw new TypeError("Failed to fetch dynamically imported module");
  return importOriginal();
});
vi.mock("../../../src/session/transport", async (importOriginal) => {
  loads.transport += 1;
  if (loads.transport === 1) throw new TypeError("Failed to fetch dynamically imported module");
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

/** What a failed load left as the error's cause: the platform's words, somewhere under it. */
function causeMessages(error: unknown): string[] {
  const messages: string[] = [];
  for (let at = error; at instanceof Error; at = at.cause) messages.push(at.message);
  return messages;
}

/** A call's settled `.safe()`, as one that reached no server would leave it, with nothing sent. */
function expectUnreached(
  settled: { data: unknown; error: unknown },
  told: ReturnType<typeof vi.fn>,
) {
  expect(settled.data).toBeNull();
  expect(isNetworkError(settled.error)).toBe(true);
  expect(causeMessages(settled.error).join(" ")).toContain(
    "Failed to fetch dynamically imported module",
  );
  expect(told).toHaveBeenCalledExactlyOnceWith(settled.error);
  expect(sent).not.toHaveBeenCalled();
}

describe("a part a page's call needs that did not arrive", () => {
  it("fails a call through the proxy whose record encoding did not load as one that reached no server", async () => {
    vi.stubGlobal("fetch", sent);
    const told = vi.fn(async (_error: RequestFailure) => undefined);
    const api = defineApi({
      name: "books",
      baseURL: "https://api.example.com",
      expose: true,
      endpoints: { save: endpoint.post("books").variables<{ title: string; cover: Blob }>() },
    });
    const page = createProxyCaller(routesOf(api, "api"), {
      proxyPath: { http: "https://app.example.com/api/request" },
      onError: told,
    });
    const record = { title: "Dune", cover: new Blob(["png"]) };

    expectUnreached(await page.save.safe(record), told);

    await expect(page.save(record)).resolves.toEqual({ ok: true });
    expect(loads.upload).toBe(2);
    expect(sent).toHaveBeenCalledOnce();
  });

  it("fails a call straight to an API whose retry policy did not load as one that reached no server", async () => {
    vi.stubGlobal("fetch", sent);
    const told = vi.fn(async (_error: RequestFailure) => undefined);
    const caller = createCaller(
      defineApi({
        name: "catalog",
        baseURL: "https://api.example.com",
        endpoints: { list: endpoint.get("items").retry({ limit: 1, delay: 1, backoff: "fixed" }) },
      }),
      { onError: told },
    );

    expectUnreached(await caller.list.safe(), told);

    await expect(caller.list()).resolves.toEqual({ ok: true });
    expect(loads.retry).toBe(2);
    expect(sent).toHaveBeenCalledOnce();
  });

  it("fails a write straight to an API whose request for its token did not load as one that reached no server", async () => {
    vi.stubGlobal("fetch", sent);
    vi.stubGlobal("document", { cookie: "sid=s1" });
    const told = vi.fn(async (_error: RequestFailure) => undefined);
    const caller = createCaller(
      defineApi({
        name: "accounts",
        baseURL: "https://api.example.com",
        session: {
          cookies: ["sid"],
          csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "/csrf" },
        },
        endpoints: { rename: endpoint.post("me/name").variables<{ name: string }>() },
      }),
      { onError: told },
    );

    expectUnreached(await caller.rename.safe({ name: "Ada" }), told);
    expect(loads.prime).toBe(1);
  });

  it("fails a call straight to an API whose check of where its session may go did not load as one that reached no server", async () => {
    vi.stubGlobal("fetch", sent);
    vi.stubGlobal("document", { cookie: "at=t1" });
    const told = vi.fn(async (_error: RequestFailure) => undefined);
    const caller = createCaller(
      defineApi({
        name: "profile",
        baseURL: "http://api.example.com",
        session: { bearer: "at" },
        endpoints: { me: endpoint.get("me") },
      }),
      { onError: told },
    );

    expectUnreached(await caller.me.safe(), told);
    expect(loads.transport).toBe(1);
  });
});
