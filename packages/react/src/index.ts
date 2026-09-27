export {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

export { createProxyQueryCaller } from "./create-proxy-query-caller";
export { createQueryCaller, type QueryCallerDefaults } from "./create-query-caller";
export { useChannel } from "./hooks/use-channel";
export type { UseComputedQueryOptions } from "./hooks/use-computed-query";
export { useComputedQuery } from "./hooks/use-computed-query";
export type { ConnectionStatusResult, ConnectionStatusSource } from "./hooks/use-connection-status";
export { useConnectionStatus } from "./hooks/use-connection-status";
export { useSubscription } from "./hooks/use-subscription";
export { createProxyQueryKeys, createQueryKeys, type QueryKeyFactory } from "./keys";
export type { OptimisticConfig } from "./optimistic";
export { optimisticOptions } from "./optimistic";
export type {
  ChannelError,
  ChannelResult,
  CourierChannelOptions,
  CourierComputedQueryOptions,
  CourierInfiniteQueryOptions,
  CourierMutationOptions,
  CourierPrefetchOptions,
  CourierQueryOptions,
  CourierSubscriptionOptions,
  CourierSuspenseQueryOptions,
  QueryCallerClient,
  QueryGroupClient,
  SubscriptionResult,
} from "./types";
