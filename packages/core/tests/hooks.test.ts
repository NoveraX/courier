import { describe, expect, it, vi } from "vitest";
import {
  cleanupAfterResponse,
  deduplicateRequest,
  getDedupeKey,
  supportsAbortController,
} from "../src/hooks/index";
import type { HttpClient } from "../src/instance/index";

describe("supportsAbortController", () => {
  it("is true in Node.js test environment", () => {
    expect(supportsAbortController).toBe(true);
  });
});

describe("getDedupeKey", () => {
  it("returns method:url without query string", () => {
    expect(getDedupeKey("https://api.com/users?page=1", "GET")).toBe(
      "GET:https://api.com/users",
    );
  });

  it("strips hash from url", () => {
    expect(getDedupeKey("https://api.com/users#section", "GET")).toBe(
      "GET:https://api.com/users",
    );
  });

  it("returns empty string for empty url", () => {
    expect(getDedupeKey("", "GET")).toBe("");
  });

  it("handles url without query or hash", () => {
    expect(getDedupeKey("https://api.com/users", "POST")).toBe("POST:https://api.com/users");
  });

  it("prefers query index over hash index", () => {
    expect(getDedupeKey("https://api.com/users?q=1#top", "GET")).toBe(
      "GET:https://api.com/users",
    );
  });

  it("keeps hash when query follows it", () => {
    // queryIndex takes priority: slices at "?" position, leaving "#top" in key
    expect(getDedupeKey("https://api.com/users#top?q=1", "GET")).toBe(
      "GET:https://api.com/users#top",
    );
  });
});

describe("cleanupAfterResponse", () => {
  it("removes pending request by key", () => {
    const client = {
      pendingRequests: {
        "GET:https://api.com/users": new AbortController(),
      },
    } as unknown as HttpClient;

    const request = new Request("https://api.com/users", { method: "GET" });
    cleanupAfterResponse.call(client, request);

    expect(client.pendingRequests["GET:https://api.com/users"]).toBeUndefined();
  });

  it("does nothing if no pending request exists", () => {
    const client = {
      pendingRequests: {},
    } as unknown as HttpClient;

    const request = new Request("https://api.com/users", { method: "GET" });
    cleanupAfterResponse.call(client, request);

    expect(Object.keys(client.pendingRequests)).toHaveLength(0);
  });

  it("strips query params when computing key", () => {
    const controller = new AbortController();
    const client = {
      pendingRequests: {
        "GET:https://api.com/users": controller,
      },
    } as unknown as HttpClient;

    const request = new Request("https://api.com/users?page=1", { method: "GET" });
    cleanupAfterResponse.call(client, request);

    expect(client.pendingRequests["GET:https://api.com/users"]).toBeUndefined();
  });
});

describe("deduplicateRequest", () => {
  it("stores new AbortController in pendingRequests", () => {
    const client = {
      pendingRequests: {} as Record<string, AbortController>,
    } as unknown as HttpClient;

    const request = new Request("https://api.com/users", { method: "GET" });
    const options = {} as any;

    deduplicateRequest.call(client, request, options);

    expect(client.pendingRequests["GET:https://api.com/users"]).toBeInstanceOf(AbortController);
  });

  it("aborts previous pending request for same key", () => {
    const previousController = new AbortController();
    const abortSpy = vi.spyOn(previousController, "abort");

    const client = {
      pendingRequests: {
        "GET:https://api.com/users": previousController,
      } as Record<string, AbortController>,
    } as unknown as HttpClient;

    const request = new Request("https://api.com/users", { method: "GET" });
    const options = {} as any;

    deduplicateRequest.call(client, request, options);

    expect(abortSpy).toHaveBeenCalled();
    // New controller replaces the old one
    expect(client.pendingRequests["GET:https://api.com/users"]).not.toBe(previousController);
  });

  it("returns a new Request", () => {
    const client = {
      pendingRequests: {} as Record<string, AbortController>,
    } as unknown as HttpClient;

    const request = new Request("https://api.com/users", { method: "GET" });
    const options = {} as any;

    const result = deduplicateRequest.call(client, request, options);

    expect(result).toBeInstanceOf(Request);
  });

  it("sets signal on options", () => {
    const client = {
      pendingRequests: {} as Record<string, AbortController>,
    } as unknown as HttpClient;

    const request = new Request("https://api.com/users", { method: "GET" });
    const options = {} as any;

    deduplicateRequest.call(client, request, options);

    expect(options.signal).toBeDefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
