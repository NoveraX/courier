/**
 * A group's hooks as they run: each takes the endpoint by name, with options
 * it does not check, and answers what TanStack Query answers.
 * `QueryGroupClient<TGroup>` is what callers see of them; a query caller
 * gives them that type once, where it builds its client.
 */
export interface UntypedGroupHooks {
  useQuery(method: string, options?: unknown): unknown;
  useSuspenseQuery(method: string, options?: unknown): unknown;
  useInfiniteQuery(method: string, options: unknown): unknown;
  prefetchQuery(queryClient: unknown, method: string, options?: unknown): Promise<void>;
  useComputedQuery(method: string, options: unknown): unknown;
  useMutation(method: string, options?: unknown): unknown;
  useSubscription(method: string, options?: unknown): unknown;
  useChannel(method: string, options?: unknown): unknown;
}
