/**
 * @vitest-environment jsdom
 */

/**
 * What a hook's `error` holds, and what its type says it holds.
 *
 * Every hook typed its error as `HTTPError`, but not everything that fails
 * a call is one: a response that fails its schema is a `ValidationError`,
 * a call cancelled through the caller's own signal rejects with that
 * signal's reason, and a misconfigured proxy path is a `ConfigurationError`.
 * Code that trusted the type read `error.status` and found `undefined`.
 * The hooks now type it as `Error`, as TanStack Query does, and the guards
 * narrow it.
 */
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

import { type HTTPError, isHTTPError, isValidationError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { createQueryCaller } from "../src/create-query-caller";
import { optimisticOptions } from "../src/optimistic";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint, stream } = courier();

let server: TestServer;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeCaller() {
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      missing: endpoint.get("missing").response<{ id: number }>(),
      malformed: endpoint.get("malformed").response(z.object({ id: z.number() })),
      create: endpoint.post("").variables<{ name: string }>().response<{ id: number }>(),
      feed: stream.get("feed").response<{ id: number }>(),
    },
  });
  return createQueryCaller(defineApi({ name: "api", baseURL: server.origin, groups: { users } }));
}

beforeEach(async () => {
  server = await startTestServer((_request, response, url) => {
    if (url.pathname === "/users/missing") return sendJson(response, { message: "gone" }, 404);
    if (url.pathname === "/users/malformed") return sendJson(response, { id: "one" });
    return sendJson(response, { message: "refused" }, 409);
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
});

describe("a query's error", () => {
  it("is an HTTPError for an error answer, narrowed by isHTTPError", async () => {
    const q = makeCaller();
    const { result } = renderHook(() => q.users.useQuery("missing"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const { error } = result.current;
    expect(isHTTPError(error) && error.status).toBe(404);
  });

  it("is a ValidationError for an answer that fails its schema", async () => {
    const q = makeCaller();
    const { result } = renderHook(() => q.users.useQuery("malformed"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const { error } = result.current;
    expect(isValidationError(error)).toBe(true);
    expect(isHTTPError(error)).toBe(false);
  });

  it("is typed as Error on every query hook", () => {
    const typeOnly = () => {
      const q = makeCaller();
      expectTypeOf(q.users.useQuery("missing").error).toEqualTypeOf<Error | null>();
      expectTypeOf(q.users.useSuspenseQuery("missing").error).toEqualTypeOf<Error | null>();
      expectTypeOf(
        q.users.useInfiniteQuery("missing", {
          initialPageParam: 1,
          getNextPageParam: () => undefined,
        }).error,
      ).toEqualTypeOf<Error | null>();
      expectTypeOf(
        q.users.useComputedQuery("missing", {
          subscriptionMethod: "feed",
          mapper: (current) => current ?? { id: 0 },
        }),
      ).toEqualTypeOf<UseQueryResult<{ id: number }, Error>>();
      q.users.useQuery("missing", {
        throwOnError: (error) => {
          expectTypeOf(error).toEqualTypeOf<Error>();
          return false;
        },
      });
      // @ts-expect-error an error that is not an HTTPError has no status
      q.users.useQuery("missing").error?.status;
    };

    expect(typeOnly).toBeTypeOf("function");
  });
});

describe("a mutation's error", () => {
  it("is an HTTPError for an error answer, narrowed by isHTTPError", async () => {
    const q = makeCaller();
    const { result } = renderHook(() => q.users.useMutation("create"), { wrapper });

    result.current.mutate({ name: "a" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const { error } = result.current;
    expect(isHTTPError<{ message: string }>(error) && error.data.message).toBe("refused");
  });

  it("is typed as Error, in the result and in onError", () => {
    const typeOnly = () => {
      const q = makeCaller();
      const mutation = q.users.useMutation("create", {
        onError: (error) => {
          expectTypeOf(error).toEqualTypeOf<Error>();
        },
      });
      expectTypeOf(mutation.error).toEqualTypeOf<Error | null>();
      expectTypeOf(optimisticOptions(queryClient, { queryKey: ["users"], updater: (x) => x }).onError)
        .parameter(0)
        .toEqualTypeOf<Error>();
    };

    expect(typeOnly).toBeTypeOf("function");
  });

  it("narrows to an HTTPError with its data", () => {
    const typeOnly = (error: Error) => {
      if (isHTTPError<{ message: string }>(error)) {
        expectTypeOf(error).toEqualTypeOf<HTTPError<{ message: string }>>();
      }
    };

    expect(typeOnly).toBeTypeOf("function");
  });
});
