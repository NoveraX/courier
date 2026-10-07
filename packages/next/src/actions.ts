import {
  type Context,
  createLogger,
  type IncomingRequest,
  type InferClient,
  type ValidationIssue,
} from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { buildClientProxy, type ExecuteBackend, executeRequest } from "@noverax/courier/internal";

import { nextIncomingRequest } from "./request-context";

const log = createLogger("Next");

/** State returned by server actions for useActionState */
export type ActionState<TData = unknown> = {
  data: TData | null;
  error: {
    message: string;
    status?: number;
    issues?: readonly ValidationIssue[];
  } | null;
};

/** Configuration for createAction */
export type ActionDefaults = {
  /** Forward incoming request headers to the API via next/headers (default: true) */
  headers?: boolean | undefined;
};

/* The action's request, for its headers and the API's session; none outside one. */
async function actionRequest(): Promise<IncomingRequest | undefined> {
  try {
    return await nextIncomingRequest();
  } catch (error) {
    /* An action runs for a request; what failed here leaves its call
       without the request rather than failing it. */
    log.debug("No request to take headers or a session from", error);
    return undefined;
  }
}

/**
 * Create a dot-notation server-side caller for Next.js Server Actions.
 * Automatically forwards request headers via `next/headers`, and carries the
 * session of an API that keeps one, handing the browser the session cookies
 * the API sets.
 *
 * The caller only forwards each call to the upstream, as `createCaller`
 * does; revalidation, form parsing and the state `useActionState` keeps are
 * the action's own business.
 *
 * @param sources - The sources map, the same one passed to `registerSources`
 * @param source - Source name (key in the sources map)
 * @param defaults - Optional configuration
 * @returns A client shaped like the source: grouped, flat or both
 *
 * @example
 * ```ts
 * // lib/actions.ts
 * import { createAction } from "@noverax/courier-next"
 * import { sources } from "@/api"
 *
 * export const action = createAction(sources, "api")
 * ```
 *
 * ```ts
 * // app/actions/users.ts
 * "use server"
 * import { revalidatePath } from "next/cache"
 * import { action } from "@/lib/actions"
 *
 * export async function createUser(data: { name: string; email: string }) {
 *   const user = await action.users.create(data)
 *   revalidatePath("/users")
 *   return user
 * }
 * ```
 */
export function createAction<TSources extends Sources, TKey extends string & keyof TSources>(
  sources: TSources,
  source: TKey,
  defaults: ActionDefaults = {},
): InferClient<TSources[TKey]> {
  const backend: ExecuteBackend = async (group, method, variables, options, raw) => {
    const incoming = await actionRequest();
    /* The session an API keeps is its own to take; `headers: false` turns
       off only the headers forwarded from the action's request. */
    const context: Context | undefined = incoming && {
      incoming,
      ...(defaults.headers !== false && { headers: incoming.headers as Headers }),
    };

    /* `.raw` and `.with({ ... })` compile here as on any caller, and are
       honoured: `.raw` returns the whole answer, and a per-call header or
       timeout reaches the request. */
    return executeRequest(
      sources,
      {
        source,
        group,
        method,
        variables: variables as Record<string, unknown>,
        options: raw ? { ...options, rawData: true } : options,
      },
      context,
    );
  };

  return buildClientProxy(backend) as InferClient<TSources[TKey]>;
}
