import { describe, expect, it, vi } from "vitest";
import {
  cleanupDeduplication,
  deduplicateAndAbortPrevious,
  getDedupeKey,
  supportsAbortController,
} from "../src/utils/deduplicate";
import type { HttpClient } from "../src/http-client/index";

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

describe("cleanupDeduplication", () => {
  it("removes the request's own entry", () => {
    const own = new AbortController();
    const client = {
      pendingRequests: { "GET:https://api.com/users": own },
    } as unknown as HttpClient;

    cleanupDeduplication(client, "GET:https://api.com/users", own);

    expect(client.pendingRequests["GET:https://api.com/users"]).toBeUndefined();
  });

  it("leaves the entry of a newer request that took the key", () => {
    const newer = new AbortController();
    const client = {
      pendingRequests: { "GET:https://api.com/users": newer },
    } as unknown as HttpClient;

    cleanupDeduplication(client, "GET:https://api.com/users", new AbortController());

    expect(client.pendingRequests["GET:https://api.com/users"]).toBe(newer);
  });

  it("does nothing if no pending request exists", () => {
    const client = {
      pendingRequests: {},
    } as unknown as HttpClient;

    cleanupDeduplication(client, "GET:https://api.com/users", new AbortController());

    expect(Object.keys(client.pendingRequests)).toHaveLength(0);
  });
});

describe("deduplicateAndAbortPrevious", () => {
  it("stores new AbortController in pendingRequests", () => {
    const client = {
      pendingRequests: {} as Record<string, AbortController>,
    } as unknown as HttpClient;

    deduplicateAndAbortPrevious(client, "GET:https://api.com/users");

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

    deduplicateAndAbortPrevious(client, "GET:https://api.com/users");

    expect(abortSpy).toHaveBeenCalled();
    // New controller replaces the old one
    expect(client.pendingRequests["GET:https://api.com/users"]).not.toBe(previousController);
  });

  it("returns the new AbortController", () => {
    const client = {
      pendingRequests: {} as Record<string, AbortController>,
    } as unknown as HttpClient;

    const controller = deduplicateAndAbortPrevious(client, "GET:https://api.com/users");

    expect(controller).toBeInstanceOf(AbortController);
    expect(client.pendingRequests["GET:https://api.com/users"]).toBe(controller);
  });
});
