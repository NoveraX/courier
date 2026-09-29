/**
 * @vitest-environment jsdom
 */
/**
 * The token a Studio page presents to make changes. The page takes it from
 * the link Studio printed and out of the address bar, keeps it for its next
 * visits, and sends it with every request and on its socket; a page opened
 * without it is told why Studio refused a change.
 */

import type { ManagerOptions, SocketOptions } from "socket.io-client";
import { io } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const TOKEN = "k".repeat(43);
const KEPT = "e".repeat(43);

/* The module keeps the token it found for the page's life: each test is a page loaded afresh. */
async function freshPage() {
  vi.resetModules();
  return import("@/lib/studio-token");
}

/* What a socket created with these options sends in its handshake. */
function handshakeOf(
  options: Partial<ManagerOptions & SocketOptions> | undefined,
): Promise<unknown> {
  const auth = options?.auth;
  if (typeof auth !== "function") return Promise.resolve(auth);
  return new Promise((resolve) => auth(resolve));
}

function visit(address: string): void {
  history.replaceState(null, "", address);
}

beforeEach(() => {
  localStorage.clear();
  visit("/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock("socket.io-client");
});

describe("the page's token", () => {
  it("is taken from the link and out of the address bar", async () => {
    visit(`/requests?view=all#token=${TOKEN}`);
    const { studioToken } = await freshPage();

    expect(studioToken()).toBe(TOKEN);
    expect(location.hash).toBe("");
    expect(`${location.pathname}${location.search}`).toBe("/requests?view=all");
  });

  it("leaves the rest of the fragment in the address", async () => {
    visit(`/#token=${TOKEN}&tab=body`);
    const { studioToken } = await freshPage();

    expect(studioToken()).toBe(TOKEN);
    expect(location.hash).toBe("#tab=body");
  });

  it("is kept for the page's next visit", async () => {
    visit(`/#token=${TOKEN}`);
    (await freshPage()).studioToken();
    visit("/");

    const { studioToken } = await freshPage();

    expect(studioToken()).toBe(TOKEN);
  });

  it("is the link's rather than one kept from an earlier visit", async () => {
    const { TOKEN_STORAGE_KEY } = await freshPage();
    localStorage.setItem(TOKEN_STORAGE_KEY, KEPT);
    visit(`/#token=${TOKEN}`);

    const { studioToken } = await freshPage();

    expect(studioToken()).toBe(TOKEN);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(TOKEN);
  });

  it("is none when neither the link nor an earlier visit gave one", async () => {
    const { studioToken, tokenHeaders } = await freshPage();

    expect(studioToken()).toBeNull();
    expect(tokenHeaders()).toEqual({});
  });

  it("is none for a fragment token Studio could not have made", async () => {
    visit("/#token=short");
    const { studioToken } = await freshPage();

    expect(studioToken()).toBeNull();
  });

  it("lasts the page's life where the browser keeps nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    visit(`/#token=${TOKEN}`);
    const { studioToken } = await freshPage();

    expect(studioToken()).toBe(TOKEN);
    expect(studioToken()).toBe(TOKEN);
    expect(warn).toHaveBeenCalledWith(
      "Studio could not keep its token for the next visit",
      expect.any(DOMException),
    );
  });
});

describe("a request to Studio", () => {
  it("carries the page's token", async () => {
    const sent: Headers[] = [];
    vi.stubGlobal("fetch", async (input: Request | URL | string, init?: RequestInit) => {
      sent.push(new Headers(input instanceof Request ? input.headers : init?.headers));
      return Response.json({ id: "s1" });
    });
    visit(`/#token=${TOKEN}`);
    const { TOKEN_HEADER } = await freshPage();
    const { post } = await import("@/lib/api-client");

    await post("/api/sessions/save", { name: "Kept", requests: [] });

    expect(sent.map((headers) => headers.get(TOKEN_HEADER))).toEqual([TOKEN]);
  });
});

describe("the page's socket", () => {
  it("presents the page's token when it connects", async () => {
    const options: Array<Partial<ManagerOptions & SocketOptions>> = [];
    vi.doMock("socket.io-client", () => ({
      io: (_uri: string, given: Partial<ManagerOptions & SocketOptions>) => {
        options.push(given);
        return io("http://127.0.0.1:9", { autoConnect: false });
      },
    }));
    visit(`/#token=${TOKEN}`);
    await freshPage();
    const { getSocket } = await import("@/socket/socket-instance");

    getSocket();

    expect(await handshakeOf(options[0])).toEqual({ token: TOKEN });
  });

  it("tells the page why Studio did not make a change", async () => {
    const { bindReadOnly } = await import("@/socket/read-only-bindings");
    const socket = io("http://127.0.0.1:9", { autoConnect: false });
    const unbind = bindReadOnly(socket);

    for (const listener of socket.listeners("studio:read-only")) {
      listener({ event: "requests:clear", error: "Open the link Studio printed." });
    }

    expect(toast.error).toHaveBeenCalledWith("Studio did not make the change", {
      id: "studio-read-only",
      description: "Open the link Studio printed.",
    });
    unbind();
    expect(socket.listeners("studio:read-only")).toHaveLength(0);
  });
});
