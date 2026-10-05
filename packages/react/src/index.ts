export {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";

export { createProxyQueryCaller } from "./create-proxy-query-caller";
export { createQueryCaller, type QueryCallerDefaults } from "./create-query-caller";
export type {
  ConnectionStatusResult,
  ConnectionStatusSource,
  StatusEventSource,
} from "./hooks/use-connection-status";
export { useConnectionStatus } from "./hooks/use-connection-status";
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
  QueryGroupNode,
  SubscriptionResult,
} from "./types";
