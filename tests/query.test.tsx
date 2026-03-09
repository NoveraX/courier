/**
 * @vitest-environment jsdom
 */

import { type ReactNode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ky", () => {
  return {
    default: { post: vi.fn() },
    HTTPError: class KYHTTPError extends Error {
      response: any;
      constructor(response: any) {
        super(`HTTP ${response.status}`);
        this.name = "HTTPError";
        this.response = response;
      }
    },
  };
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import ky from "ky";
import type { Endpoint } from "../src/define/types";
import { createQueryRequest } from "../src/query/index";

type TestApi = {
  api: {
    options: {
      groups: {
        users: {
          getAll: Endpoint<{ id: number; name: string }[]>;
          getById: Endpoint<{ id: number; name: string }, { id: number }>;
          create: Endpoint<{ id: number; name: string }, { name: string }>;
        };
        cache: {
          clear: Endpoint<{ ok: boolean }>;
        };
      };
    };
  };
};

const mockPost = vi.mocked(ky.post);

function kyResponse(data: unknown, status = 200) {
  const response = { status, headers: new Headers(), ok: status < 400 };
  const p = Promise.resolve(response);
  (p as any).json = () => Promise.resolve(data);
  (p as any).text = () => Promise.resolve(JSON.stringify(data));
  return p as any;
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  mockPost.mockReset();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
});

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

describe("createQueryRequest", () => {
  it("returns useQuery, useMutation, and request", () => {
    const result = createQueryRequest<TestApi>();
    expect(result).toHaveProperty("useQuery");
    expect(result).toHaveProperty("useMutation");
    expect(result).toHaveProperty("request");
    expect(typeof result.useQuery).toBe("function");
    expect(typeof result.useMutation).toBe("function");
    expect(typeof result.request).toBe("function");
  });

  it("passes defaults to createClientRequest", () => {
    const defaults = { routePath: "/custom" };
    const { request } = createQueryRequest<TestApi>(defaults);
    expect(typeof request).toBe("function");
  });
});

describe("useQuery", () => {
  it("fetches data and returns result", async () => {
    const users = [{ id: 1, name: "Alice" }];
    mockPost.mockReturnValue(kyResponse(users));

    const { useQuery } = createQueryRequest<TestApi>();
    const { result } = renderHook(() => useQuery("api", "users:getAll"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(users);
  });

  it("passes variables to the request", async () => {
    const user = { id: 1, name: "Alice" };
    mockPost.mockReturnValue(kyResponse(user));

    const { useQuery } = createQueryRequest<TestApi>();
    const { result } = renderHook(
      () => useQuery("api", "users:getById", { variables: { id: 1 } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const postCall = mockPost.mock.calls[0];
    expect(postCall).toBeDefined();
    const body = postCall?.[1]?.json as any;
    expect(body?.variables).toEqual({ id: 1 });
  });

  it("builds query key without variables when undefined", async () => {
    mockPost.mockReturnValue(kyResponse([]));

    const { useQuery } = createQueryRequest<TestApi>();
    renderHook(() => useQuery("api", "users:getAll"), { wrapper });

    await waitFor(() => expect(mockPost).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache).toHaveLength(1);
    expect(cache[0]?.queryKey).toEqual(["api", "users:getAll"]);
  });

  it("builds query key with variables when provided", async () => {
    mockPost.mockReturnValue(kyResponse({}));

    const { useQuery } = createQueryRequest<TestApi>();
    renderHook(
      () => useQuery("api", "users:getById", { variables: { id: 5 } }),
      { wrapper },
    );

    await waitFor(() => expect(mockPost).toHaveBeenCalled());

    const cache = queryClient.getQueryCache().getAll();
    expect(cache).toHaveLength(1);
    expect(cache[0]?.queryKey).toEqual(["api", "users:getById", { id: 5 }]);
  });

  it("forwards extra query options (enabled: false)", () => {
    const { useQuery } = createQueryRequest<TestApi>();
    const { result } = renderHook(
      () => useQuery("api", "users:getAll", { enabled: false }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("handles fetch errors", async () => {
    const error = new Error("Network error");
    const p = Promise.reject(error);
    (p as any).json = () => Promise.reject(error);
    (p as any).text = () => Promise.reject(error);
    p.catch(() => {});
    mockPost.mockReturnValue(p as any);

    const { useQuery } = createQueryRequest<TestApi>();
    const { result } = renderHook(() => useQuery("api", "users:getAll"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Network error");
  });
});

describe("useMutation", () => {
  it("performs mutation and returns data", async () => {
    const created = { id: 1, name: "Alice" };
    mockPost.mockReturnValue(kyResponse(created));

    const { useMutation } = createQueryRequest<TestApi>();
    const { result } = renderHook(
      () => useMutation("api", "users:create"),
      { wrapper },
    );

    result.current.mutate({ name: "Alice" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(created);
  });

  it("passes variables to mutationFn", async () => {
    mockPost.mockReturnValue(kyResponse({ id: 1 }));

    const { useMutation } = createQueryRequest<TestApi>();
    const { result } = renderHook(
      () => useMutation("api", "users:create"),
      { wrapper },
    );

    result.current.mutate({ name: "Bob" } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = mockPost.mock.calls[0]?.[1]?.json as any;
    expect(body?.variables).toEqual({ name: "Bob" });
  });

  it("calls onSuccess callback", async () => {
    mockPost.mockReturnValue(kyResponse({ id: 1 }));
    const onSuccess = vi.fn();

    const { useMutation } = createQueryRequest<TestApi>();
    const { result } = renderHook(
      () =>
        useMutation("api", "users:create", {
          onSuccess: onSuccess as (data: { id: number; name: string }) => void,
        }),
      { wrapper },
    );

    result.current.mutate({ name: "Alice" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalled();
    expect(onSuccess.mock.calls[0]?.[0]).toEqual({ id: 1 });
  });

  it("handles mutation errors", async () => {
    const error = new Error("Server error");
    const p = Promise.reject(error);
    (p as any).json = () => Promise.reject(error);
    (p as any).text = () => Promise.reject(error);
    p.catch(() => {});
    mockPost.mockReturnValue(p as any);

    const { useMutation } = createQueryRequest<TestApi>();
    const { result } = renderHook(
      () => useMutation("api", "users:create"),
      { wrapper },
    );

    result.current.mutate({ name: "Alice" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Server error");
  });

  it("mutates without variables for void endpoints", async () => {
    mockPost.mockReturnValue(kyResponse({ ok: true }));

    const { useMutation } = createQueryRequest<TestApi>();
    const { result } = renderHook(
      () => useMutation("api", "cache:clear"),
      { wrapper },
    );

    result.current.mutate(undefined as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
