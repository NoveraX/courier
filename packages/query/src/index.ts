"use client";

export {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

export { createQueryCaller } from "./create-query-caller";
export { createQueryKeys } from "./keys";
export type { OptimisticConfig } from "./optimistic";
export { optimisticOptions } from "./optimistic";
export type {
  NexusInfiniteQueryOptions,
  NexusMutationOptions,
  NexusPrefetchOptions,
  NexusQueryOptions,
  NexusSuspenseQueryOptions,
  QueryCallerClient,
  QueryGroupClient,
} from "./types";
