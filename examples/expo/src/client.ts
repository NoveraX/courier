import { createCaller } from "@noverax/courier";
import { createQueryCaller } from "@noverax/courier-react";
import { QueryClient } from "@tanstack/react-query";

import { API_URL } from "./address";
import { shopApi } from "./api";

/** The shop at the example server's address. */
export const shop = shopApi(API_URL);

/** Hooks for every endpoint: `q.users.useQuery("list")`. */
export const q = createQueryCaller(shop);

/** Plain calls, for what a hook does not do: an upload's progress, a call cancelled by hand. */
export const client = createCaller(shop);

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
