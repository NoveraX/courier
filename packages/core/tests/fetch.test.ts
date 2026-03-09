import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coreFetch } from "../src/utils/fetch";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getFetchCall(index = 0) {
  const [url, init] = fetchSpy.mock.calls[index] || [];
  return { url: url as string, init: init as RequestInit & Record<string, unknown> };
}

describe("coreFetch", () => {
  describe("method", () => {
    it("uppercases method", async () => {
      await coreFetch("post", "https://api.com/users");
      expect(getFetchCall().init.method).toBe("POST");
    });

    it('maps "del" to DELETE', async () => {
      await coreFetch("del", "https://api.com/users/1");
      expect(getFetchCall().init.method).toBe("DELETE");
    });
  });

  describe("searchParams", () => {
    it("appends URLSearchParams to url", async () => {
      await coreFetch("get", "https://api.com/users", {
        searchParams: new URLSearchParams({ page: "1", limit: "10" }),
      });
      expect(getFetchCall().url).toBe("https://api.com/users?page=1&limit=10");
    });

    it("appends Record as search params", async () => {
      await coreFetch("get", "https://api.com/users", {
        searchParams: { page: "1" },
      });
      expect(getFetchCall().url).toBe("https://api.com/users?page=1");
    });

    it("appends string as search params", async () => {
      await coreFetch("get", "https://api.com/users", {
        searchParams: "page=1&limit=10",
      });
      expect(getFetchCall().url).toBe("https://api.com/users?page=1&limit=10");
    });

    it("uses & when url already has query string", async () => {
      await coreFetch("get", "https://api.com/users?sort=asc", {
        searchParams: { page: "2" },
      });
      expect(getFetchCall().url).toBe("https://api.com/users?sort=asc&page=2");
    });

    it("skips empty search params", async () => {
      await coreFetch("get", "https://api.com/users", {
        searchParams: new URLSearchParams(),
      });
      expect(getFetchCall().url).toBe("https://api.com/users");
    });
  });

  describe("headers", () => {
    it("accepts Headers instance", async () => {
      const headers = new Headers({ "x-custom": "value" });
      await coreFetch("get", "https://api.com", { headers });
      const h = getFetchCall().init.headers as Headers;
      expect(h.get("x-custom")).toBe("value");
    });

    it("accepts plain object headers", async () => {
      await coreFetch("get", "https://api.com", {
        headers: { "x-custom": "value" },
      });
      const h = getFetchCall().init.headers as Headers;
      expect(h.get("x-custom")).toBe("value");
    });

    it("defaults to empty headers", async () => {
      await coreFetch("get", "https://api.com");
      const h = getFetchCall().init.headers as Headers;
      expect([...h.entries()]).toHaveLength(0);
    });
  });

  describe("json body", () => {
    it("serializes json and sets content-type", async () => {
      await coreFetch("post", "https://api.com", {
        json: { name: "test" },
      });
      const { init } = getFetchCall();
      expect(init.body).toBe('{"name":"test"}');
      expect((init.headers as Headers).get("content-type")).toBe("application/json");
    });

    it("does not override existing content-type", async () => {
      await coreFetch("post", "https://api.com", {
        json: { name: "test" },
        headers: { "content-type": "application/json; charset=utf-8" },
      });
      expect((getFetchCall().init.headers as Headers).get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
    });

    it("prefers json over body", async () => {
      await coreFetch("post", "https://api.com", {
        json: { a: 1 },
        body: "raw",
      });
      expect(getFetchCall().init.body).toBe('{"a":1}');
    });
  });

  describe("timeout + signal", () => {
    it("creates timeout signal when timeout is set", async () => {
      await coreFetch("get", "https://api.com", { timeout: 5000 });
      expect(getFetchCall().init.signal).toBeDefined();
    });

    it("does not set signal when no timeout and no signal", async () => {
      await coreFetch("get", "https://api.com");
      expect(getFetchCall().init.signal).toBeUndefined();
    });

    it("passes through existing signal without timeout", async () => {
      const controller = new AbortController();
      await coreFetch("get", "https://api.com", { signal: controller.signal });
      expect(getFetchCall().init.signal).toBe(controller.signal);
    });

    it("combines signal and timeout", async () => {
      const controller = new AbortController();
      await coreFetch("get", "https://api.com", {
        signal: controller.signal,
        timeout: 5000,
      });
      const signal = getFetchCall().init.signal as AbortSignal;
      // Combined signal is a new AbortSignal (not the original)
      expect(signal).toBeDefined();
      expect(signal).not.toBe(controller.signal);
    });

    it("skips timeout when value is 0", async () => {
      await coreFetch("get", "https://api.com", { timeout: 0 });
      expect(getFetchCall().init.signal).toBeUndefined();
    });
  });

  describe("pass-through options", () => {
    it("forwards credentials", async () => {
      await coreFetch("get", "https://api.com", { credentials: "include" });
      expect(getFetchCall().init.credentials).toBe("include");
    });

    it("forwards cache", async () => {
      await coreFetch("get", "https://api.com", { cache: "no-store" });
      expect(getFetchCall().init.cache).toBe("no-store");
    });

    it("forwards non-standard properties via rest spread", async () => {
      await coreFetch("get", "https://api.com", {
        next: { revalidate: 60 },
      } as Record<string, unknown>);
      expect(getFetchCall().init.next).toEqual({ revalidate: 60 });
    });
  });
});
